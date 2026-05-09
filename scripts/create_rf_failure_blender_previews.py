from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
RENDERS_DIR = ROOT / "public" / "cable-renders"
MODELS_DIR = ROOT / "public" / "models"
BLEND_PATH = MODELS_DIR / "rf-failure-defect-visuals.blend"

LENGTH = 6.2
X_SEGMENTS = 104
ANGLE_SEGMENTS = 96
CUT_START = math.radians(220)
CUT_END = math.radians(505)

CASES = [
    ("kink", "rf-failure-kink.png"),
    ("crush", "rf-failure-crush.png"),
    ("foil-gap", "rf-failure-foil-gap.png"),
    ("eccentric", "rf-failure-eccentric.png"),
    ("launch", "rf-failure-launch.png"),
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
            ("gtao_factor", 1.35),
            ("use_bloom", True),
            ("bloom_intensity", 0.018),
        ):
            if hasattr(eevee, attr):
                setattr(eevee, attr, value)

    scene.world = bpy.data.worlds.new("RF_Failure_World") if scene.world is None else scene.world
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
        if hasattr(mat, "use_screen_refraction"):
            mat.use_screen_refraction = True

    return mat


def gaussian(x: float, width: float) -> float:
    return math.exp(-(x * x) / (2 * width * width))


def center_offset(x: float, kind: str) -> tuple[float, float]:
    if kind == "kink":
        return 0.38 * math.tanh(x * 1.9), 0.06 * math.sin(x * 1.4)
    return 0, 0


def local_scale(x: float, kind: str) -> tuple[float, float]:
    if kind == "crush":
        g = gaussian(x, 0.44)
        return 1.13 + 0.08 * g, 1 - 0.48 * g
    return 1, 1


def conductor_offset(x: float, kind: str) -> tuple[float, float]:
    oy, oz = center_offset(x, kind)
    if kind == "eccentric":
        g = gaussian(x + 0.35, 1.18)
        oy += 0.20 * g
        oz -= 0.09 * g
    return oy, oz


def make_curve(
    name: str,
    coords: list[tuple[float, float, float]],
    material: bpy.types.Material,
    bevel_depth: float,
    *,
    bevel_resolution: int = 5,
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


def conductor_path(kind: str, *, length: float = LENGTH, points: int = 180) -> list[tuple[float, float, float]]:
    coords = []
    for i in range(points):
        x = -length / 2 + length * i / (points - 1)
        oy, oz = conductor_offset(x, kind)
        coords.append((x, oy, oz))
    return coords


def should_skip_foil_face(kind: str, x_mid: float, theta_mid: float) -> bool:
    if kind != "foil-gap":
        return False
    theta = (theta_mid + math.tau) % math.tau
    front_window = math.radians(245) <= theta <= math.radians(330)
    return abs(x_mid) < 0.52 and front_window


def make_shell(
    name: str,
    inner_r: float,
    outer_r: float,
    material: bpy.types.Material,
    kind: str,
    *,
    start_angle: float = CUT_START,
    end_angle: float = CUT_END,
    length: float = LENGTH,
    x_segments: int = X_SEGMENTS,
    angle_segments: int = ANGLE_SEGMENTS,
) -> bpy.types.Object:
    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    angles = [start_angle + (end_angle - start_angle) * j / angle_segments for j in range(angle_segments + 1)]

    def add_surface(radius: float) -> list[list[int]]:
        rows = []
        for i in range(x_segments + 1):
            x = -length / 2 + length * i / x_segments
            oy, oz = center_offset(x, kind)
            sy, sz = local_scale(x, kind)
            row = []
            for theta in angles:
                verts.append((x, oy + radius * sy * math.cos(theta), oz + radius * sz * math.sin(theta)))
                row.append(len(verts) - 1)
            rows.append(row)
        return rows

    outer = add_surface(outer_r)
    inner = add_surface(inner_r)

    for i in range(x_segments):
        x_mid = -length / 2 + length * (i + 0.5) / x_segments
        for j in range(angle_segments):
            theta_mid = (angles[j] + angles[j + 1]) / 2
            if should_skip_foil_face(kind, x_mid, theta_mid) and "Foil" in name:
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


def helix_path(
    radius: float,
    phase: float,
    turns: float,
    kind: str,
    handedness: int,
    *,
    points: int = 190,
) -> list[tuple[float, float, float]]:
    coords = []
    for i in range(points):
        t = i / (points - 1)
        x = -LENGTH / 2 + LENGTH * t
        if kind == "foil-gap" and abs(x) < 0.42 and i % 7 in (0, 1):
            continue
        oy, oz = center_offset(x, kind)
        sy, sz = local_scale(x, kind)
        theta = phase + handedness * turns * math.tau * t
        coords.append((x, oy + radius * sy * math.cos(theta), oz + radius * sz * math.sin(theta)))
    return coords


def make_braid(kind: str, mat_a: bpy.types.Material, mat_b: bpy.types.Material) -> None:
    carriers = 20
    for i in range(carriers):
        phase = math.tau * i / carriers
        make_curve(f"Braid_RH_{i:02d}", helix_path(0.76, phase, 5.4, kind, 1), mat_a if i % 2 else mat_b, 0.006, bevel_resolution=2)
        make_curve(f"Braid_LH_{i:02d}", helix_path(0.80, phase + math.pi / carriers, 5.4, kind, -1), mat_b if i % 2 else mat_a, 0.006, bevel_resolution=2)


def make_foil_flap(material: bpy.types.Material) -> None:
    verts = [
        (-0.50, -0.66, 0.06),
        (0.38, -0.66, 0.06),
        (0.66, -1.16, 0.38),
        (-0.32, -1.04, 0.34),
    ]
    faces = [[0, 1, 2, 3]]
    mesh = bpy.data.meshes.new("RF_Foil_Peeled_Flap_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("RF_Foil_Peeled_Flap", mesh)
    obj.data.materials.append(material)
    bpy.context.collection.objects.link(obj)


def add_crush_plates(material: bpy.types.Material) -> None:
    for z, name in ((0.72, "Upper_Crush_Block"), (-0.72, "Lower_Crush_Block")):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, z))
        obj = bpy.context.object
        obj.name = name
        obj.dimensions = (1.18, 2.35, 0.075)
        obj.data.materials.append(material)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def add_torus_marker(kind: str, material: bpy.types.Material, *, x: float = 0) -> None:
    oy, oz = center_offset(x, kind)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.88,
        minor_radius=0.013,
        major_segments=112,
        minor_segments=8,
        location=(x, oy, oz),
        rotation=(0, math.pi / 2, 0),
    )
    obj = bpy.context.object
    obj.name = f"RF_{kind}_marker_ring"
    obj.data.materials.append(material)


def add_connector_launch(metal: bpy.types.Material, insulator: bpy.types.Material, pin: bpy.types.Material, warning: bpy.types.Material) -> None:
    parts = [
        ("Connector_Back_Nut", 0.42, 0.56, LENGTH / 2 + 0.26, metal),
        ("Connector_Body", 0.58, 0.42, LENGTH / 2 + 0.70, metal),
        ("Connector_Ferrule_Step", 0.36, 0.24, LENGTH / 2 + 1.03, metal),
        ("Connector_PTFE_Bead", 0.24, 0.18, LENGTH / 2 + 1.10, insulator),
        ("Connector_Pin", 0.075, 0.62, LENGTH / 2 + 1.08, pin),
    ]
    for name, radius, depth, x, mat in parts:
        bpy.ops.mesh.primitive_cylinder_add(vertices=72, radius=radius, depth=depth, location=(x, 0, 0), rotation=(0, math.pi / 2, 0))
        obj = bpy.context.object
        obj.name = name
        obj.data.materials.append(mat)
        bpy.ops.object.shade_smooth()
    add_torus_marker("launch", warning, x=LENGTH / 2 + 0.32)


def add_scene_helpers(kind: str, mats: dict[str, bpy.types.Material]) -> None:
    if kind == "foil-gap":
        make_foil_flap(mats["foil"])
    elif kind == "crush":
        add_crush_plates(mats["crush"])
    elif kind == "launch":
        add_connector_launch(mats["steel"], mats["ptfe"], mats["copper"], mats["warn"])
    else:
        add_torus_marker(kind, mats["warn"], x=-0.20 if kind == "eccentric" else 0)


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_case(kind: str, output_name: str, *, save_blend: bool = False) -> None:
    reset_scene()
    set_render_settings()

    mats = {
        "copper": make_material("RF copper center conductor", (0.84, 0.41, 0.16, 1), metallic=0.72, roughness=0.26),
        "dielectric": make_material("RF foamed PE dielectric", (0.95, 0.83, 0.55, 1), roughness=0.28, alpha=0.72),
        "foil": make_material("RF aluminum foil shield", (0.78, 0.84, 0.88, 1), metallic=0.86, roughness=0.20, alpha=0.72),
        "braid_a": make_material("RF copper braid", (0.94, 0.55, 0.23, 1), metallic=0.78, roughness=0.25),
        "braid_b": make_material("RF tinned braid", (0.70, 0.74, 0.74, 1), metallic=0.82, roughness=0.27),
        "jacket": make_material("RF matte black jacket", (0.018, 0.026, 0.030, 1), roughness=0.82),
        "warn": make_material("RF defect marker amber", (1.0, 0.64, 0.10, 1), roughness=0.30, emission=(1.0, 0.34, 0.06), emission_strength=0.28),
        "crush": make_material("RF transparent clamp pressure", (1.0, 0.18, 0.16, 1), roughness=0.35, alpha=0.34),
        "steel": make_material("RF connector brushed steel", (0.72, 0.76, 0.75, 1), metallic=0.88, roughness=0.23),
        "ptfe": make_material("RF connector PTFE bead", (0.90, 0.88, 0.78, 1), roughness=0.32),
        "floor": make_material("RF charcoal floor", (0.018, 0.022, 0.024, 1), roughness=0.86),
    }

    make_curve("RF_Center_Conductor", conductor_path(kind), mats["copper"], 0.135, bevel_resolution=8)
    make_shell("RF_Dielectric_Cutaway", 0.16, 0.56, mats["dielectric"], kind)
    make_shell("RF_Foil_Shield_Cutaway", 0.59, 0.65, mats["foil"], kind)
    make_braid(kind, mats["braid_a"], mats["braid_b"])
    make_shell("RF_Outer_Jacket_Cutaway", 0.88, 1.08, mats["jacket"], kind)
    add_scene_helpers(kind, mats)

    bpy.ops.object.light_add(type="AREA", location=(0, -5.2, 3.6))
    light = bpy.context.object
    light.name = "RF_Key_Light"
    light.data.energy = 840
    light.data.size = 5.8

    bpy.ops.object.light_add(type="POINT", location=(-3.2, 2.4, 1.9))
    rim = bpy.context.object
    rim.name = "RF_Warm_Rim"
    rim.data.energy = 95
    rim.data.color = (1.0, 0.54, 0.26)

    bpy.ops.mesh.primitive_plane_add(size=9.0, location=(0, 0.08, -1.16))
    floor = bpy.context.object
    floor.name = "RF_Matte_Ground"
    floor.data.materials.append(mats["floor"])

    bpy.ops.object.camera_add(location=(5.8, -7.6, 3.05))
    camera = bpy.context.object
    camera.name = f"Camera_RF_{kind}"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 6.55 if kind != "launch" else 7.05
    look_at(camera, Vector((0.05 if kind != "launch" else 0.52, -0.02, 0.03)))
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
