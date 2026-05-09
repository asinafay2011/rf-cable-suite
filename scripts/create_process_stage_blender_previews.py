from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
RENDERS_DIR = ROOT / "public" / "cable-renders"
MODELS_DIR = ROOT / "public" / "models"
BLEND_PATH = MODELS_DIR / "process-stage-walkthrough.blend"

LENGTH = 4.9
POINTS = 170
PAIR_SEP = 0.075
PAIR_TURNS = 6.25
PAIR_POSITIONS = [(-0.27, 0.27), (0.27, 0.27), (-0.27, -0.27), (0.27, -0.27)]
PAIR_COLORS = [
    (0.17, 0.55, 0.92, 1),
    (0.95, 0.48, 0.20, 1),
    (0.23, 0.75, 0.56, 1),
    (0.55, 0.35, 0.18, 1),
]

STAGES = [
    (1, "process-stage-01-conductor.png"),
    (2, "process-stage-02-stranding.png"),
    (3, "process-stage-03-insulation.png"),
    (4, "process-stage-04-pair-twist.png"),
    (5, "process-stage-05-pair-wrap.png"),
    (6, "process-stage-06-pair-foil.png"),
    (7, "process-stage-07-bundle.png"),
    (8, "process-stage-08-outer-shield.png"),
    (9, "process-stage-09-jacket.png"),
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
    scene.world = bpy.data.worlds.new("Process_Stage_World") if scene.world is None else scene.world
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


def line_path(y: float = 0, z: float = 0, *, length: float = LENGTH, points: int = POINTS) -> list[tuple[float, float, float]]:
    return [(-length / 2 + length * i / (points - 1), y, z) for i in range(points)]


def strand_path(radius: float, turns: float, phase: float) -> list[tuple[float, float, float]]:
    coords = []
    for i in range(POINTS):
        t = i / (POINTS - 1)
        x = -LENGTH / 2 + LENGTH * t
        theta = phase + turns * math.tau * t
        coords.append((x, radius * math.cos(theta), radius * math.sin(theta)))
    return coords


def pair_wire_path(pair_index: int, side: int, *, pair_offset: tuple[float, float] | None = None) -> list[tuple[float, float, float]]:
    base_y, base_z = pair_offset if pair_offset is not None else PAIR_POSITIONS[pair_index]
    coords = []
    phase = math.tau * pair_index / 4 + (0 if side < 0 else math.pi)
    for i in range(POINTS):
        t = i / (POINTS - 1)
        x = -LENGTH / 2 + LENGTH * t
        theta = phase + PAIR_TURNS * math.tau * t
        coords.append((x, base_y + PAIR_SEP * math.cos(theta), base_z + PAIR_SEP * math.sin(theta)))
    return coords


def wrap_helix(pair_offset: tuple[float, float], radius: float, turns: float, phase: float) -> list[tuple[float, float, float]]:
    y0, z0 = pair_offset
    coords = []
    for i in range(POINTS):
        t = i / (POINTS - 1)
        x = -LENGTH / 2 + LENGTH * t
        theta = phase + turns * math.tau * t
        coords.append((x, y0 + radius * math.cos(theta), z0 + radius * math.sin(theta)))
    return coords


def make_helix_ribbon(
    name: str,
    pair_offset: tuple[float, float],
    radius: float,
    turns: float,
    phase: float,
    width_angle: float,
    material: bpy.types.Material,
    *,
    points: int = POINTS,
    edge_material: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Wide tape/foil strip wrapped on the pair surface."""
    y0, z0 = pair_offset
    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    half = width_angle / 2
    for i in range(points):
        t = i / (points - 1)
        x = -LENGTH / 2 + LENGTH * t
        theta = phase + turns * math.tau * t
        for edge in (-half, half):
            a = theta + edge
            verts.append((x, y0 + radius * math.cos(a), z0 + radius * math.sin(a)))
    for i in range(points - 1):
        faces.append([2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2])

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

    if edge_material:
        for sign, label in ((-1, "A"), (1, "B")):
            coords = []
            for i in range(points):
                t = i / (points - 1)
                x = -LENGTH / 2 + LENGTH * t
                theta = phase + turns * math.tau * t + sign * half
                coords.append((x, y0 + radius * math.cos(theta), z0 + radius * math.sin(theta)))
            make_curve(f"{name}_Edge_{label}", coords, edge_material, 0.0035, bevel_resolution=1)
    return obj


def superellipse_point(theta: float, a: float, b: float, power: float = 4.6) -> tuple[float, float]:
    c = math.cos(theta)
    s = math.sin(theta)
    y = math.copysign(abs(c) ** (2 / power), c) * a
    z = math.copysign(abs(s) ** (2 / power), s) * b
    return y * (1 + 0.02 * math.cos(4 * theta)), z * (1 + 0.02 * math.cos(4 * theta))


def superellipse_helix(a: float, b: float, turns: float, phase: float, handedness: int = 1) -> list[tuple[float, float, float]]:
    coords = []
    for i in range(POINTS):
        t = i / (POINTS - 1)
        x = -LENGTH / 2 + LENGTH * t
        y, z = superellipse_point(phase + handedness * turns * math.tau * t, a, b)
        coords.append((x, y, z))
    return coords


def make_superellipse_shell(
    name: str,
    inner_a: float,
    inner_b: float,
    outer_a: float,
    outer_b: float,
    material: bpy.types.Material,
    *,
    start_angle: float = math.radians(-145),
    end_angle: float = math.radians(160),
    segments: int = 92,
) -> bpy.types.Object:
    angles = [start_angle + (end_angle - start_angle) * i / segments for i in range(segments + 1)]
    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []

    def add_ring(x: float, a: float, b: float) -> list[int]:
        ids = []
        for theta in angles:
            y, z = superellipse_point(theta, a, b)
            verts.append((x, y, z))
            ids.append(len(verts) - 1)
        return ids

    x0 = -LENGTH / 2
    x1 = LENGTH / 2
    outer_back = add_ring(x0, outer_a, outer_b)
    outer_front = add_ring(x1, outer_a, outer_b)
    inner_back = add_ring(x0, inner_a, inner_b)
    inner_front = add_ring(x1, inner_a, inner_b)
    for i in range(segments):
        faces.append([outer_back[i], outer_back[i + 1], outer_front[i + 1], outer_front[i]])
        faces.append([inner_front[i], inner_front[i + 1], inner_back[i + 1], inner_back[i]])
        faces.append([outer_front[i], outer_front[i + 1], inner_front[i + 1], inner_front[i]])
        faces.append([outer_back[i + 1], outer_back[i], inner_back[i], inner_back[i + 1]])
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


def make_spline(material: bpy.types.Material) -> None:
    for name, dims in (
        ("X_Spline_Vertical", (LENGTH * 0.92, 0.025, 0.86)),
        ("X_Spline_Horizontal", (LENGTH * 0.92, 0.86, 0.025)),
    ):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
        obj = bpy.context.object
        obj.name = name
        obj.dimensions = dims
        obj.data.materials.append(material)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def build_materials() -> dict[str, bpy.types.Material]:
    return {
        "copper": make_material("Copper", (0.86, 0.42, 0.16, 1), metallic=0.72, roughness=0.24),
        "white": make_material("White insulation", (0.86, 0.85, 0.78, 1), roughness=0.42),
        "dielectric": make_material("Foamed dielectric", (0.62, 0.78, 0.92, 1), roughness=0.38),
        "ptfe": make_material("PTFE tape ribbon", (0.92, 0.88, 0.70, 1), roughness=0.58, alpha=0.72),
        "ptfe_edge": make_material("PTFE tape cut edge", (1.0, 0.95, 0.76, 1), roughness=0.48, alpha=0.88),
        "foil": make_material("Foil ribbon", (0.78, 0.84, 0.88, 1), metallic=0.75, roughness=0.2, alpha=0.62),
        "foil_edge": make_material("Foil ribbon bright edge", (0.96, 0.98, 1.0, 1), metallic=0.82, roughness=0.18, alpha=0.82),
        "braid_a": make_material("Copper braid", (0.93, 0.56, 0.24, 1), metallic=0.72, roughness=0.25),
        "braid_b": make_material("Tinned braid", (0.70, 0.73, 0.72, 1), metallic=0.8, roughness=0.28),
        "jacket": make_material("Black jacket", (0.018, 0.026, 0.03, 1), roughness=0.8),
        "spline": make_material("X spline", (0.33, 0.90, 0.78, 1), roughness=0.34, alpha=0.46, emission=(0.08, 0.45, 0.38), emission_strength=0.08),
        "floor": make_material("Charcoal floor", (0.018, 0.022, 0.024, 1), roughness=0.86),
        "amber": make_material("Process amber highlight", (1.0, 0.70, 0.18, 1), roughness=0.3, emission=(1.0, 0.40, 0.08), emission_strength=0.12),
    }


def draw_conductor(mats: dict[str, bpy.types.Material]) -> None:
    make_curve("Drawn_Copper_Wire", line_path(), mats["copper"], 0.035)
    make_curve("Feed_Rod_Before_Die", line_path(-0.32, 0.16, length=2.0, points=70), mats["copper"], 0.075)
    make_curve("Exit_Fine_Wire", line_path(0.24, -0.12, length=2.8, points=90), mats["copper"], 0.018)


def draw_stranding(mats: dict[str, bpy.types.Material]) -> None:
    make_curve("Center_Strand", line_path(), mats["copper"], 0.018)
    for i in range(6):
        make_curve(f"Outer_Strand_{i + 1}", strand_path(0.07, 7.2, math.tau * i / 6), mats["copper"], 0.014)


def draw_insulation(mats: dict[str, bpy.types.Material]) -> None:
    make_curve("Insulation_Core", line_path(), mats["copper"], 0.023)
    make_curve("Foamed_Insulation", line_path(), mats["dielectric"], 0.105)
    make_curve("Extrusion_Centerline", line_path(0, 0.14, length=3.0, points=80), mats["amber"], 0.006, bevel_resolution=2)


def draw_pair(mats: dict[str, bpy.types.Material], pair_offset: tuple[float, float] = (0, 0)) -> None:
    for side, mat in ((-1, mats["dielectric"]), (1, mats["white"])):
        make_curve(f"Pair_Wire_{side}_{pair_offset[0]:.1f}", pair_wire_path(0, side, pair_offset=pair_offset), mat, 0.038)
        make_curve(f"Pair_Core_{side}_{pair_offset[0]:.1f}", pair_wire_path(0, side, pair_offset=pair_offset), mats["copper"], 0.010, bevel_resolution=2)


def draw_pair_wrap(mats: dict[str, bpy.types.Material]) -> None:
    draw_pair(mats)
    make_helix_ribbon("PTFE_Tape_Ribbon", (0, 0), 0.168, 7.2, math.radians(18), 0.74, mats["ptfe"], edge_material=mats["ptfe_edge"])
    make_curve("PTFE_Lap_Ridge", wrap_helix((0, 0), 0.172, 7.2, math.radians(45)), mats["ptfe_edge"], 0.004, bevel_resolution=1)


def draw_pair_foil(mats: dict[str, bpy.types.Material]) -> None:
    draw_pair_wrap(mats)
    make_helix_ribbon("Foil_Shield_Ribbon", (0, 0), 0.214, 5.6, math.radians(138), 0.82, mats["foil"], edge_material=mats["foil_edge"])
    make_curve("Foil_Lap_Ridge", wrap_helix((0, 0), 0.220, 5.6, math.radians(166)), mats["foil_edge"], 0.005, bevel_resolution=1)
    make_curve("Drain_Wire", line_path(-0.19, -0.11), mats["copper"], 0.010, bevel_resolution=2)


def draw_bundle(mats: dict[str, bpy.types.Material]) -> None:
    for pair, color in enumerate(PAIR_COLORS):
        pair_mat = make_material(f"Pair_Color_{pair}", color, roughness=0.38)
        y, z = PAIR_POSITIONS[pair]
        for side, mat in ((-1, pair_mat), (1, mats["white"])):
            make_curve(f"Bundle_P{pair}_{side}", pair_wire_path(pair, side, pair_offset=(y, z)), mat, 0.031, bevel_resolution=3)
        make_curve(f"Bundle_Foil_{pair}", wrap_helix((y, z), 0.16, 4.2, math.tau * pair / 4), mats["foil"], 0.006, bevel_resolution=2)
    make_spline(mats["spline"])


def draw_outer_shield(mats: dict[str, bpy.types.Material]) -> None:
    draw_bundle(mats)
    for i in range(18):
        phase = math.tau * i / 18
        make_curve(f"Braid_RH_{i:02d}", superellipse_helix(0.82, 0.66, 4.8, phase, 1), mats["braid_a"] if i % 2 else mats["braid_b"], 0.006, bevel_resolution=2)
        make_curve(f"Braid_LH_{i:02d}", superellipse_helix(0.84, 0.68, 4.8, phase + math.pi / 18, -1), mats["braid_b"] if i % 2 else mats["braid_a"], 0.006, bevel_resolution=2)


def draw_jacket(mats: dict[str, bpy.types.Material]) -> None:
    draw_outer_shield(mats)
    make_superellipse_shell("Outer_Jacket_Cutaway", 0.91, 0.73, 1.08, 0.88, mats["jacket"])


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_scene_basics(mats: dict[str, bpy.types.Material]) -> None:
    bpy.ops.object.light_add(type="AREA", location=(0, -4.5, 3.3))
    light = bpy.context.object
    light.name = "Key_Light"
    light.data.energy = 760
    light.data.size = 4.8

    bpy.ops.object.light_add(type="POINT", location=(-2.5, 2.0, 1.6))
    rim = bpy.context.object
    rim.name = "Warm_Rim"
    rim.data.energy = 70
    rim.data.color = (1.0, 0.52, 0.24)

    bpy.ops.mesh.primitive_plane_add(size=6.8, location=(0, 0, -1.04))
    floor = bpy.context.object
    floor.name = "Matte_Ground"
    floor.data.materials.append(mats["floor"])

    bpy.ops.object.camera_add(location=(4.45, -5.75, 2.85))
    camera = bpy.context.object
    camera.name = "Camera_Process_Stage"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.35
    look_at(camera, Vector((0, 0, 0.02)))
    bpy.context.scene.camera = camera


def build_stage(stage: int, output_name: str, *, save_blend: bool = False) -> None:
    reset_scene()
    set_render_settings()
    mats = build_materials()
    if stage == 1:
        draw_conductor(mats)
    elif stage == 2:
        draw_stranding(mats)
    elif stage == 3:
        draw_insulation(mats)
    elif stage == 4:
        draw_pair(mats)
    elif stage == 5:
        draw_pair_wrap(mats)
    elif stage == 6:
        draw_pair_foil(mats)
    elif stage == 7:
        draw_bundle(mats)
    elif stage == 8:
        draw_outer_shield(mats)
    else:
        draw_jacket(mats)
    add_scene_basics(mats)
    bpy.context.scene.render.filepath = str(RENDERS_DIR / output_name)
    bpy.ops.render.render(write_still=True)
    if save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))


def main() -> None:
    ensure_dirs()
    for index, (stage, output_name) in enumerate(STAGES):
        build_stage(stage, output_name, save_blend=index == len(STAGES) - 1)


if __name__ == "__main__":
    main()
