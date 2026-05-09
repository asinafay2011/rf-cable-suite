from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
RENDERS_DIR = ROOT / "public" / "cable-renders"
MODELS_DIR = ROOT / "public" / "models"
BLEND_PATH = MODELS_DIR / "tdr-defect-visuals.blend"

LENGTH = 5.2
POINTS = 160
PAIR_SEP = 0.062
PAIR_TURNS = 5.6
PAIR_POSITIONS = [
    (-0.27, 0.25),
    (0.27, 0.25),
    (-0.27, -0.25),
    (0.27, -0.25),
]
PAIR_COLORS = [
    (0.17, 0.55, 0.92, 1),
    (0.95, 0.48, 0.20, 1),
    (0.23, 0.75, 0.56, 1),
    (0.55, 0.35, 0.18, 1),
]

CASES = [
    ("kink", "tdr-defect-kink.png"),
    ("crush", "tdr-defect-crush.png"),
    ("foil-gap", "tdr-defect-foil-gap.png"),
    ("eccentric", "tdr-defect-eccentric.png"),
]


def ensure_dirs() -> None:
    RENDERS_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def set_render_settings() -> None:
    scene = bpy.context.scene
    scene.render.resolution_x = 1120
    scene.render.resolution_y = 630
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    for engine in ("BLENDER_EEVEE", "BLENDER_WORKBENCH"):
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
            ("gtao_factor", 1.35),
            ("use_bloom", True),
            ("bloom_intensity", 0.012),
        ):
            if hasattr(eevee, attr):
                setattr(eevee, attr, value)
    scene.world = bpy.data.worlds.new("TDR_Defect_World") if scene.world is None else scene.world
    scene.world.color = (0.012, 0.015, 0.017)


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
    return mat


def make_curve(
    name: str,
    coords: list[tuple[float, float, float]],
    material: bpy.types.Material,
    bevel_depth: float,
    *,
    bevel_resolution: int = 4,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
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


def gaussian(x: float, width: float) -> float:
    return math.exp(-(x * x) / (2 * width * width))


def center_offset(x: float, kind: str) -> tuple[float, float]:
    if kind == "kink":
        return (0, 0.34 * math.tanh(x * 2.8))
    return (0, 0)


def local_scale(x: float, kind: str) -> tuple[float, float]:
    if kind == "crush":
        g = gaussian(x, 0.42)
        return (1.16 + 0.08 * g, 1 - 0.52 * g)
    return (1, 1)


def superellipse_point(theta: float, a: float, b: float, *, power: float = 4.4) -> tuple[float, float]:
    c = math.cos(theta)
    s = math.sin(theta)
    y = math.copysign(abs(c) ** (2 / power), c) * a
    z = math.copysign(abs(s) ** (2 / power), s) * b
    return y * (1 + 0.022 * math.cos(4 * theta)), z * (1 + 0.022 * math.cos(4 * theta))


def pair_wire_path(pair_index: int, side: int, kind: str) -> list[tuple[float, float, float]]:
    base_y, base_z = PAIR_POSITIONS[pair_index]
    coords = []
    phase = math.tau * pair_index / 4 + (0 if side < 0 else math.pi)
    for i in range(POINTS):
        t = i / (POINTS - 1)
        x = -LENGTH / 2 + LENGTH * t
        off_y, off_z = center_offset(x, kind)
        sy, sz = local_scale(x, kind)
        angle = phase + PAIR_TURNS * math.tau * t
        eccentric = 0.055 * gaussian(x + 0.8, 0.72) if kind == "eccentric" and pair_index == 1 and side < 0 else 0
        y = off_y + sy * (base_y + (PAIR_SEP + eccentric) * math.cos(angle))
        z = off_z + sz * (base_z + (PAIR_SEP - eccentric * 0.25) * math.sin(angle))
        coords.append((x, y, z))
    return coords


def superellipse_helix(a: float, b: float, turns: float, phase: float, kind: str, handedness: int) -> list[tuple[float, float, float]]:
    coords = []
    for i in range(POINTS):
        t = i / (POINTS - 1)
        x = -LENGTH / 2 + LENGTH * t
        if kind == "foil-gap" and abs(x) < 0.26 and int(phase * 10) % 3 == 0:
            continue
        off_y, off_z = center_offset(x, kind)
        sy, sz = local_scale(x, kind)
        theta = phase + handedness * turns * math.tau * t
        y, z = superellipse_point(theta, a * sy, b * sz)
        coords.append((x, y + off_y, z + off_z))
    return coords


def make_superellipse_shell(
    name: str,
    inner_a: float,
    inner_b: float,
    outer_a: float,
    outer_b: float,
    material: bpy.types.Material,
    kind: str,
    *,
    start_angle: float = math.radians(-148),
    end_angle: float = math.radians(162),
    x_segments: int = 70,
    angle_segments: int = 88,
) -> bpy.types.Object:
    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    angles = [start_angle + (end_angle - start_angle) * j / angle_segments for j in range(angle_segments + 1)]

    def add_strip(a: float, b: float) -> list[list[int]]:
        rows = []
        for i in range(x_segments + 1):
            x = -LENGTH / 2 + LENGTH * i / x_segments
            off_y, off_z = center_offset(x, kind)
            sy, sz = local_scale(x, kind)
            row = []
            for theta in angles:
                y, z = superellipse_point(theta, a * sy, b * sz)
                verts.append((x, y + off_y, z + off_z))
                row.append(len(verts) - 1)
            rows.append(row)
        return rows

    outer = add_strip(outer_a, outer_b)
    inner = add_strip(inner_a, inner_b)

    for i in range(x_segments):
        for j in range(angle_segments):
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


def make_foil_flap(material: bpy.types.Material) -> bpy.types.Object:
    verts = [
        (-0.38, -0.78, 0.02),
        (0.38, -0.78, 0.06),
        (0.56, -1.18, 0.32),
        (-0.18, -1.08, 0.30),
    ]
    faces = [[0, 1, 2, 3]]
    mesh = bpy.data.meshes.new("Foil_Gap_Flap_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Foil_Gap_Peeled_Flap", mesh)
    obj.data.materials.append(material)
    bpy.context.collection.objects.link(obj)
    return obj


def add_crush_plates(material: bpy.types.Material) -> None:
    for z, name in ((0.72, "Upper_Crush_Plate"), (-0.72, "Lower_Crush_Plate")):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, z))
        obj = bpy.context.object
        obj.name = name
        obj.dimensions = (1.05, 1.95, 0.06)
        obj.data.materials.append(material)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def add_defect_marker(kind: str, mat_warn: bpy.types.Material, mat_foil: bpy.types.Material) -> None:
    if kind == "foil-gap":
        make_foil_flap(mat_foil)
    elif kind == "crush":
        add_crush_plates(mat_warn)
    else:
        bpy.ops.mesh.primitive_torus_add(
            major_radius=0.86,
            minor_radius=0.012,
            major_segments=96,
            minor_segments=8,
            location=(-0.08 if kind == "eccentric" else 0, 0, 0.04),
            rotation=(math.pi / 2, 0, 0),
        )
        obj = bpy.context.object
        obj.name = f"{kind}_tdr_marker"
        obj.scale.y = 0.78
        obj.data.materials.append(mat_warn)


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_case(kind: str, output_name: str, *, save_blend: bool = False) -> None:
    reset_scene()
    set_render_settings()

    copper = make_material("Copper", (0.86, 0.42, 0.16, 1), metallic=0.72, roughness=0.24)
    white = make_material("White mate insulation", (0.86, 0.85, 0.78, 1), roughness=0.42)
    pair_mats = [make_material(f"Pair {i}", color, roughness=0.38) for i, color in enumerate(PAIR_COLORS)]
    foil = make_material("Translucent foil", (0.78, 0.84, 0.88, 1), metallic=0.75, roughness=0.2, alpha=0.36)
    braid_a = make_material("Copper braid", (0.93, 0.56, 0.24, 1), metallic=0.72, roughness=0.25)
    braid_b = make_material("Tinned braid", (0.70, 0.73, 0.72, 1), metallic=0.8, roughness=0.28)
    jacket = make_material("Black jacket cutaway", (0.018, 0.026, 0.03, 1), roughness=0.8)
    warn = make_material("TDR warning amber", (1.0, 0.72, 0.12, 1), roughness=0.32, emission=(1.0, 0.38, 0.05), emission_strength=0.24)
    crush_mat = make_material("Transparent crush plate", (1.0, 0.20, 0.18, 1), roughness=0.38, alpha=0.38)
    floor_mat = make_material("Charcoal floor", (0.018, 0.022, 0.024, 1), roughness=0.86)

    for pair in range(4):
        for side in (-1, 1):
            path = pair_wire_path(pair, side, kind)
            make_curve(f"Copper_P{pair}_{side}", path, copper, 0.010, bevel_resolution=3)
            make_curve(f"Insulation_P{pair}_{side}", path, pair_mats[pair] if side < 0 else white, 0.035, bevel_resolution=4)

    make_superellipse_shell("Foil_Shield_Cutaway", 0.69, 0.55, 0.76, 0.61, foil, kind)
    for i in range(16):
        phase = math.tau * i / 16
        make_curve(f"Braid_RH_{i:02d}", superellipse_helix(0.84, 0.68, 4.1, phase, kind, 1), braid_a if i % 2 else braid_b, 0.005, bevel_resolution=2)
        make_curve(f"Braid_LH_{i:02d}", superellipse_helix(0.86, 0.70, 4.1, phase + math.pi / 16, kind, -1), braid_b if i % 2 else braid_a, 0.005, bevel_resolution=2)
    make_superellipse_shell("Outer_Jacket_Cutaway", 0.93, 0.75, 1.10, 0.90, jacket, kind)
    add_defect_marker(kind, crush_mat if kind == "crush" else warn, foil)

    bpy.ops.object.light_add(type="AREA", location=(0, -4.5, 3.2))
    light = bpy.context.object
    light.name = "Key_Light"
    light.data.energy = 760
    light.data.size = 4.8

    bpy.ops.object.light_add(type="POINT", location=(-2.6, 2.1, 1.7))
    rim = bpy.context.object
    rim.name = "Warm_Rim"
    rim.data.energy = 75
    rim.data.color = (1.0, 0.52, 0.24)

    bpy.ops.mesh.primitive_plane_add(size=7.2, location=(0, 0, -1.04))
    floor = bpy.context.object
    floor.name = "Matte_Ground"
    floor.data.materials.append(floor_mat)

    bpy.ops.object.camera_add(location=(4.5, -5.8, 2.7))
    camera = bpy.context.object
    camera.name = f"Camera_{kind}"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.45
    look_at(camera, Vector((0, 0, 0.02)))
    bpy.context.scene.camera = camera

    bpy.context.scene.render.filepath = str(RENDERS_DIR / output_name)
    bpy.ops.render.render(write_still=True)
    if save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))


def main() -> None:
    ensure_dirs()
    for index, (kind, output_name) in enumerate(CASES):
        build_case(kind, output_name, save_blend=index == len(CASES) - 1)


if __name__ == "__main__":
    main()
