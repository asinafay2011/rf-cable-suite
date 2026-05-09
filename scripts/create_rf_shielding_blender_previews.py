from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
RENDERS_DIR = ROOT / "public" / "cable-renders"
MODELS_DIR = ROOT / "public" / "models"
BLEND_PATH = MODELS_DIR / "rf-shielding-effectiveness.blend"

LENGTH = 6.4
SEGMENTS = 108
CUT_START = math.radians(218)
CUT_END = math.radians(505)

CASES = [
    {
        "id": "none",
        "output": "rf-shield-none.png",
        "foil_layers": 0,
        "braid_layers": [],
        "leak": 1.0,
        "gap": False,
        "label": "No shield",
    },
    {
        "id": "braid70",
        "output": "rf-shield-braid70.png",
        "foil_layers": 0,
        "braid_layers": [(0.74, 10, 4.6)],
        "leak": 0.46,
        "gap": False,
        "label": "70% braid",
    },
    {
        "id": "braid95",
        "output": "rf-shield-braid95.png",
        "foil_layers": 0,
        "braid_layers": [(0.76, 22, 5.6)],
        "leak": 0.18,
        "gap": False,
        "label": "95% braid",
    },
    {
        "id": "foilGap",
        "output": "rf-shield-foil-gap.png",
        "foil_layers": 1,
        "braid_layers": [],
        "leak": 0.30,
        "gap": True,
        "label": "Foil gap",
    },
    {
        "id": "foilBraid",
        "output": "rf-shield-foil-braid.png",
        "foil_layers": 1,
        "braid_layers": [(0.78, 20, 5.3)],
        "leak": 0.08,
        "gap": False,
        "label": "Foil + braid",
    },
    {
        "id": "quad",
        "output": "rf-shield-quad.png",
        "foil_layers": 2,
        "braid_layers": [(0.76, 20, 5.2), (0.92, 18, 4.6)],
        "leak": 0.025,
        "gap": False,
        "label": "Quad shield",
    },
]


def ensure_dirs() -> None:
    RENDERS_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def set_render_settings() -> None:
    scene = bpy.context.scene
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    if hasattr(scene, "eevee"):
        eevee = scene.eevee
        for attr, value in (
            ("use_gtao", True),
            ("gtao_distance", 3),
            ("gtao_factor", 1.4),
            ("use_bloom", True),
            ("bloom_intensity", 0.035),
        ):
            if hasattr(eevee, attr):
                setattr(eevee, attr, value)
    scene.world = bpy.data.worlds.new("RF_Shielding_World") if scene.world is None else scene.world
    scene.world.color = (0.010, 0.013, 0.016)


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0,
    roughness: float = 0.45,
    alpha: float = 1,
    emission: tuple[float, float, float] | None = None,
    emission_strength: float = 0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (color[0], color[1], color[2], alpha)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        def set_input(label: str, value) -> None:
            if label in bsdf.inputs:
                bsdf.inputs[label].default_value = value

        set_input("Base Color", (color[0], color[1], color[2], alpha))
        set_input("Metallic", metallic)
        set_input("Roughness", roughness)
        set_input("Alpha", alpha)
        if emission:
            set_input("Emission Color", (emission[0], emission[1], emission[2], 1))
            set_input("Emission Strength", emission_strength)
    if alpha < 1:
        mat.blend_method = "BLEND"
        mat.show_transparent_back = True
        if hasattr(mat, "use_screen_refraction"):
            mat.use_screen_refraction = True
    return mat


def make_curve(
    name: str,
    coords: list[tuple[float, float, float]],
    material: bpy.types.Material,
    bevel_depth: float,
    *,
    bevel_resolution: int = 3,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 3
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = bevel_resolution
    spline = curve.splines.new("POLY")
    spline.points.add(len(coords) - 1)
    for point, coord in zip(spline.points, coords):
        point.co = (coord[0], coord[1], coord[2], 1)
    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(material)
    bpy.context.collection.objects.link(obj)
    return obj


def make_shell(
    name: str,
    inner_r: float,
    outer_r: float,
    material: bpy.types.Material,
    *,
    length: float = LENGTH,
    start_angle: float = CUT_START,
    end_angle: float = CUT_END,
    gap: bool = False,
) -> bpy.types.Object:
    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    angles = [start_angle + (end_angle - start_angle) * j / SEGMENTS for j in range(SEGMENTS + 1)]

    def add_surface(radius: float) -> list[list[int]]:
        rows = []
        for i in range(SEGMENTS + 1):
            x = -length / 2 + length * i / SEGMENTS
            row = []
            for theta in angles:
                verts.append((x, radius * math.cos(theta), radius * math.sin(theta)))
                row.append(len(verts) - 1)
            rows.append(row)
        return rows

    outer = add_surface(outer_r)
    inner = add_surface(inner_r)

    for i in range(SEGMENTS):
        x_mid = -length / 2 + length * (i + 0.5) / SEGMENTS
        for j in range(SEGMENTS):
            theta = (angles[j] + angles[j + 1]) / 2
            theta_mod = (theta + math.tau) % math.tau
            is_gap = gap and abs(x_mid) < 0.52 and math.radians(245) <= theta_mod <= math.radians(330)
            if is_gap:
                continue
            faces.append([outer[i][j], outer[i + 1][j], outer[i + 1][j + 1], outer[i][j + 1]])
            faces.append([inner[i][j + 1], inner[i + 1][j + 1], inner[i + 1][j], inner[i][j]])

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    obj.select_set(False)
    return obj


def make_braid(radius: float, carriers: int, turns: float, mats: dict[str, bpy.types.Material], *, layer_name: str) -> None:
    points = 190
    for i in range(carriers):
        for handedness, prefix in ((1, "RH"), (-1, "LH")):
            coords = []
            phase = math.tau * (i + (0.5 if handedness < 0 else 0)) / carriers
            for point_index in range(points):
                t = point_index / (points - 1)
                x = -LENGTH / 2 + LENGTH * t
                theta = phase + handedness * turns * math.tau * t
                coords.append((x, radius * math.cos(theta), radius * math.sin(theta)))
            mat = mats["braid_copper"] if (i + (0 if handedness > 0 else 1)) % 2 else mats["braid_tin"]
            make_curve(f"{layer_name}_{prefix}_{i:02d}", coords, mat, 0.0055, bevel_resolution=2)


def add_field_lines(leak: float, mats: dict[str, bpy.types.Material], *, gap: bool) -> None:
    line_count = 11
    for i in range(line_count):
        x = -2.75 + i * (5.5 / (line_count - 1))
        phase = i * 0.7
        stop_z = 0.58 + 0.12 * math.sin(phase)
        incoming = []
        for j in range(48):
            t = j / 47
            y = -2.62 + t * 1.55
            z = 1.30 - t * (0.70 + 0.12 * math.sin(phase)) + 0.055 * math.sin(t * math.tau * 2.0 + phase)
            incoming.append((x + 0.035 * math.sin(t * math.tau + phase), y, z))
        make_curve(f"EMI_Incoming_{i:02d}", incoming, mats["field_in"], 0.009, bevel_resolution=3)

        reflected = []
        for j in range(34):
            t = j / 33
            y = -1.06 - t * 1.08
            z = stop_z - t * 0.58 + 0.055 * math.sin(t * math.tau * 1.5 + phase)
            reflected.append((x + 0.025 * math.sin(t * math.tau + phase), y, z))
        make_curve(f"EMI_Reflected_{i:02d}", reflected, mats["field_reflect"], 0.0065, bevel_resolution=2)

    leak_count = max(0, min(9, round(leak * 9)))
    if gap:
        xs = [-0.42, -0.25, -0.08, 0.10, 0.28]
        leak_count = max(leak_count, 5)
    else:
        xs = [-2.4, -1.7, -1.0, -0.35, 0.35, 1.0, 1.7, 2.4, 2.85]
    for i in range(leak_count):
        x = xs[i % len(xs)]
        amp = 0.022 + leak * 0.020
        coords = []
        for j in range(68):
            t = j / 67
            y = -2.46 + t * 2.55
            z = 1.18 - t * 1.05 + amp * math.sin(t * math.tau * 3.0 + i)
            coords.append((x + 0.030 * math.sin(t * math.tau + i), y, z))
        make_curve(f"EMI_Leak_{i:02d}", coords, mats["field_leak"], 0.006 + leak * 0.004, bevel_resolution=3)

    if leak > 0.015:
        for i in range(max(2, min(8, int(leak * 8)))):
            phase = math.tau * i / max(2, int(leak * 8))
            coords = []
            for j in range(80):
                t = j / 79
                theta = phase + t * math.tau * 1.1
                coords.append((0.1 + 0.48 * (t - 0.5), 0.18 * math.cos(theta), 0.18 * math.sin(theta)))
            make_curve(f"Core_Coupled_Noise_{i:02d}", coords, mats["field_core"], 0.0048, bevel_resolution=2)


def add_shield_label(case: dict, mats: dict[str, bpy.types.Material]) -> None:
    bpy.ops.object.text_add(location=(-2.9, -1.95, 1.75), rotation=(math.radians(62), 0, 0))
    obj = bpy.context.object
    obj.name = f"Label_{case['id']}"
    obj.data.body = case["label"].upper()
    obj.data.align_x = "LEFT"
    obj.data.align_y = "CENTER"
    obj.data.size = 0.18
    obj.data.materials.append(mats["label"])


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_case(case: dict, *, save_blend: bool = False) -> None:
    reset_scene()
    set_render_settings()

    mats = {
        "copper": make_material("Center conductor copper", (0.86, 0.42, 0.16, 1), metallic=0.72, roughness=0.25),
        "dielectric": make_material("Foamed dielectric translucent", (0.94, 0.84, 0.56, 1), roughness=0.28, alpha=0.70),
        "foil": make_material("Aluminum foil shield", (0.78, 0.84, 0.88, 1), metallic=0.86, roughness=0.20, alpha=0.75),
        "foil_outer": make_material("Outer foil shield", (0.62, 0.68, 0.74, 1), metallic=0.90, roughness=0.18, alpha=0.70),
        "braid_copper": make_material("Copper braid", (0.94, 0.55, 0.23, 1), metallic=0.78, roughness=0.25),
        "braid_tin": make_material("Tinned braid", (0.72, 0.75, 0.75, 1), metallic=0.82, roughness=0.26),
        "jacket": make_material("Matte jacket", (0.015, 0.022, 0.027, 1), roughness=0.83),
        "field_in": make_material("Incoming EMI cyan", (0.25, 0.88, 1.0, 1), roughness=0.2, emission=(0.10, 0.74, 1.0), emission_strength=0.55),
        "field_reflect": make_material("Reflected EMI teal", (0.26, 1.0, 0.78, 1), roughness=0.2, emission=(0.10, 0.88, 0.62), emission_strength=0.45),
        "field_leak": make_material("Leakage EMI orange", (1.0, 0.35, 0.10, 1), roughness=0.2, emission=(1.0, 0.24, 0.04), emission_strength=0.75),
        "field_core": make_material("Core coupled noise", (1.0, 0.72, 0.12, 1), roughness=0.2, emission=(1.0, 0.55, 0.04), emission_strength=0.65),
        "label": make_material("Label amber", (1.0, 0.62, 0.18, 1), roughness=0.3, emission=(0.9, 0.42, 0.08), emission_strength=0.25),
        "floor": make_material("Charcoal floor", (0.018, 0.022, 0.024, 1), roughness=0.86),
    }

    make_curve("Center_Conductor", [(-LENGTH / 2, 0, 0), (LENGTH / 2, 0, 0)], mats["copper"], 0.13, bevel_resolution=8)
    make_shell("Foamed_Dielectric", 0.16, 0.56, mats["dielectric"])

    for layer in range(case["foil_layers"]):
        base = 0.60 + layer * 0.20
        make_shell(
            f"Foil_Shield_{layer + 1}",
            base,
            base + 0.055,
            mats["foil"] if layer == 0 else mats["foil_outer"],
            gap=case["gap"] and layer == 0,
        )

    for layer_index, (radius, carriers, turns) in enumerate(case["braid_layers"]):
        make_braid(radius, carriers, turns, mats, layer_name=f"Braid_{layer_index + 1}")

    jacket_inner = 0.86 + 0.16 * max(0, len(case["braid_layers"]) - 1)
    make_shell("Outer_Jacket_Cutaway", jacket_inner, jacket_inner + 0.19, mats["jacket"])

    add_field_lines(case["leak"], mats, gap=case["gap"])
    add_shield_label(case, mats)

    bpy.ops.object.light_add(type="AREA", location=(0, -5.6, 3.7))
    key = bpy.context.object
    key.name = "Shielding_Key_Light"
    key.data.energy = 940
    key.data.size = 5.8

    bpy.ops.object.light_add(type="POINT", location=(-3.2, 2.4, 1.9))
    rim = bpy.context.object
    rim.name = "Warm_Rim_Light"
    rim.data.energy = 110
    rim.data.color = (1.0, 0.55, 0.25)

    bpy.ops.mesh.primitive_plane_add(size=9.2, location=(0, 0.06, -1.18))
    floor = bpy.context.object
    floor.name = "Matte_Ground"
    floor.data.materials.append(mats["floor"])

    bpy.ops.object.camera_add(location=(5.6, -7.4, 3.05))
    camera = bpy.context.object
    camera.name = f"Camera_Shielding_{case['id']}"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 6.65
    look_at(camera, Vector((0.04, -0.18, 0.18)))
    bpy.context.scene.camera = camera

    bpy.context.scene.render.filepath = str(RENDERS_DIR / case["output"])
    bpy.ops.render.render(write_still=True)
    if save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))


def main() -> None:
    ensure_dirs()
    for index, case in enumerate(CASES):
        build_case(case, save_blend=index == len(CASES) - 1)


if __name__ == "__main__":
    main()
