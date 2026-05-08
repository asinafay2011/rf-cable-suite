from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT / "public" / "models"
VIDEOS_DIR = ROOT / "public" / "videos"
RENDERS_DIR = ROOT / "public" / "cable-renders"

BLEND_PATH = MODELS_DIR / "highspeed-cable-bundle-build.blend"
GLB_PATH = MODELS_DIR / "highspeed-cable-bundle-build.glb"
FRAMES_DIR = VIDEOS_DIR / "highspeed-cable-bundle-build-frames"
PREVIEW_PATH = RENDERS_DIR / "highspeed-cable-bundle-build-preview.png"

LENGTH = 5.7
POINTS = 240
PAIR_SEP = 0.07
PAIR_TURNS = 7.25
PAIR_WRAP_RADIUS = 0.16

PAIR_POSITIONS = [
    (-0.31, 0.31),  # blue
    (0.31, 0.31),   # orange
    (-0.31, -0.31), # green
    (0.31, -0.31),  # brown
]
PAIR_PHASES = [
    math.radians(42),
    math.radians(138),
    math.radians(-42),
    math.radians(-138),
]


def ensure_dirs() -> None:
    for path in (MODELS_DIR, VIDEOS_DIR, FRAMES_DIR, RENDERS_DIR):
        path.mkdir(parents=True, exist_ok=True)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def set_render_settings() -> None:
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 288
    scene.frame_set(1)
    scene.render.fps = 24
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False

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
            ("gtao_factor", 1.28),
            ("use_bloom", True),
            ("bloom_intensity", 0.012),
        ):
            if hasattr(eevee, attr):
                setattr(eevee, attr, value)

    scene.world = bpy.data.worlds.new("Highspeed_Dark_World") if scene.world is None else scene.world
    scene.world.color = (0.012, 0.015, 0.017)
    scene.render.image_settings.file_format = "PNG"


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0,
    roughness: float = 0.42,
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


def empty(name: str) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.18
    return obj


def make_curve(
    name: str,
    coords: list[tuple[float, float, float]],
    material: bpy.types.Material,
    bevel_depth: float,
    *,
    resolution: int = 3,
    bevel_resolution: int = 5,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
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


def pair_center(pair_index: int, t: float) -> tuple[float, float, float]:
    y, z = PAIR_POSITIONS[pair_index]
    x = -LENGTH / 2 + LENGTH * t
    return (x, y, z)


def wire_path(pair_index: int, side: int) -> list[tuple[float, float, float]]:
    coords = []
    start_phase = PAIR_PHASES[pair_index]
    for i in range(POINTS):
        t = i / (POINTS - 1)
        x, cy, cz = pair_center(pair_index, t)
        angle = start_phase + PAIR_TURNS * math.tau * t + (0 if side < 0 else math.pi)
        coords.append((x, cy + PAIR_SEP * math.cos(angle), cz + PAIR_SEP * math.sin(angle)))
    return coords


def pair_wrap_path(pair_index: int, radius: float, turns: float, phase: float) -> list[tuple[float, float, float]]:
    coords = []
    start_phase = PAIR_PHASES[pair_index]
    for i in range(POINTS):
        t = i / (POINTS - 1)
        x, cy, cz = pair_center(pair_index, t)
        angle = start_phase + phase + turns * math.tau * t
        coords.append((x, cy + radius * math.cos(angle), cz + radius * math.sin(angle)))
    return coords


def superellipse_point(
    theta: float,
    a: float,
    b: float,
    *,
    power: float = 4.8,
    lobe: float = 0.032,
) -> tuple[float, float]:
    c = math.cos(theta)
    s = math.sin(theta)
    y = math.copysign(abs(c) ** (2 / power), c) * a
    z = math.copysign(abs(s) ** (2 / power), s) * b
    scale = 1 + lobe * math.cos(4 * theta)
    return y * scale, z * scale


def superellipse_helix(
    a: float,
    b: float,
    turns: float,
    phase: float,
    *,
    handedness: int = 1,
    power: float = 4.8,
) -> list[tuple[float, float, float]]:
    coords = []
    for i in range(POINTS):
        t = i / (POINTS - 1)
        x = -LENGTH / 2 + LENGTH * t
        theta = phase + handedness * turns * math.tau * t
        y, z = superellipse_point(theta, a, b, power=power)
        coords.append((x, y, z))
    return coords


def make_pair_sleeve(
    name: str,
    pair_index: int,
    radius: float,
    material: bpy.types.Material,
    *,
    segments: int = 56,
) -> bpy.types.Object:
    y, z = PAIR_POSITIONS[pair_index]
    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    for x in (-LENGTH / 2, LENGTH / 2):
        for i in range(segments):
            theta = math.tau * i / segments
            verts.append((x, y + radius * math.cos(theta), z + radius * math.sin(theta)))
    for i in range(segments):
        faces.append([i, (i + 1) % segments, segments + (i + 1) % segments, segments + i])

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


def make_spline_fin(name: str, material: bpy.types.Material, dimensions: tuple[float, float, float]) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    obj.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def make_superellipse_shell(
    name: str,
    inner_a: float,
    inner_b: float,
    outer_a: float,
    outer_b: float,
    material: bpy.types.Material,
    *,
    start_angle: float = math.radians(-150),
    end_angle: float = math.radians(168),
    segments: int = 104,
) -> bpy.types.Object:
    angles = [
        start_angle + (end_angle - start_angle) * i / segments
        for i in range(segments + 1)
    ]
    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []

    def add_ring(x: float, a: float, b: float) -> list[int]:
        ids = []
        for angle in angles:
            y, z = superellipse_point(angle, a, b, power=4.8, lobe=0.032)
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

    faces.append([outer_back[0], outer_front[0], inner_front[0], inner_back[0]])
    faces.append([outer_front[-1], outer_back[-1], inner_back[-1], inner_front[-1]])

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


def make_superellipse_ring(
    name: str,
    x: float,
    a: float,
    b: float,
    material: bpy.types.Material,
    bevel_depth: float,
    *,
    start_angle: float = math.radians(-150),
    end_angle: float = math.radians(168),
    segments: int = 120,
) -> bpy.types.Object:
    coords = []
    for i in range(segments + 1):
        theta = start_angle + (end_angle - start_angle) * i / segments
        y, z = superellipse_point(theta, a, b, power=4.8, lobe=0.032)
        coords.append((x, y, z))
    return make_curve(name, coords, material, bevel_depth, bevel_resolution=3)


def parent_to(parent: bpy.types.Object, children: list[bpy.types.Object]) -> None:
    for child in children:
        child.parent = parent


def animate_layer(obj: bpy.types.Object, start: int, end: int, offset_z: float = -0.16) -> None:
    obj.location = (0, 0, offset_z)
    obj.scale = (0.7, 0.045, 0.045)
    obj.hide_viewport = True
    obj.hide_render = True
    obj.keyframe_insert("hide_viewport", frame=max(1, start - 2))
    obj.keyframe_insert("hide_render", frame=max(1, start - 2))

    obj.hide_viewport = False
    obj.hide_render = False
    obj.keyframe_insert("hide_viewport", frame=start)
    obj.keyframe_insert("hide_render", frame=start)
    obj.keyframe_insert("location", frame=start)
    obj.keyframe_insert("scale", frame=start)

    obj.location = (0, 0, 0)
    obj.scale = (1, 1, 1)
    obj.keyframe_insert("location", frame=end)
    obj.keyframe_insert("scale", frame=end)


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_scene() -> None:
    ensure_dirs()
    reset_scene()
    set_render_settings()

    copper = make_material("Copper conductors", (0.84, 0.42, 0.16, 1), metallic=0.75, roughness=0.26)
    white = make_material("White insulation mates", (0.88, 0.86, 0.78, 1), roughness=0.42)
    ptfe = make_material("PTFE tape sleeve", (0.92, 0.88, 0.74, 1), roughness=0.58, alpha=0.34)
    ptfe_edge = make_material("PTFE tape lap seam", (1.0, 0.93, 0.68, 1), roughness=0.46, alpha=0.62)
    foil = make_material("Foil shield sleeve", (0.74, 0.80, 0.84, 1), metallic=0.85, roughness=0.2, alpha=0.33)
    foil_edge = make_material("Foil shield lap seam", (0.92, 0.96, 1.0, 1), metallic=0.86, roughness=0.2, alpha=0.72)
    braid_a = make_material("Braid copper strands", (0.94, 0.58, 0.25, 1), metallic=0.78, roughness=0.24)
    braid_b = make_material("Braid tinned strands", (0.70, 0.73, 0.72, 1), metallic=0.82, roughness=0.28)
    jacket = make_material("Matte black non-round jacket", (0.018, 0.026, 0.03, 1), roughness=0.78)
    binder = make_material("Clear bundle binder", (0.70, 0.78, 0.86, 1), metallic=0.1, roughness=0.28, alpha=0.24)
    spline = make_material("X-spline filler", (0.33, 0.90, 0.78, 1), roughness=0.34, alpha=0.48, emission=(0.08, 0.45, 0.38), emission_strength=0.08)
    floor_mat = make_material("Charcoal floor", (0.018, 0.022, 0.024, 1), roughness=0.86)

    pair_mats = [
        make_material("Pair blue insulation", (0.16, 0.55, 0.92, 1), roughness=0.38),
        make_material("Pair orange insulation", (0.96, 0.45, 0.18, 1), roughness=0.38),
        make_material("Pair green insulation", (0.20, 0.76, 0.54, 1), roughness=0.38),
        make_material("Pair brown insulation", (0.55, 0.33, 0.18, 1), roughness=0.42),
    ]

    root = empty("Highspeed_Full_Stack_Animated_Root")
    conductor_group = empty("Layer_01_Copper_Conductors")
    insulation_group = empty("Layer_02_Insulation_Blue_Orange_Green_Brown")
    twist_group = empty("Layer_03_Even_Two_Wire_Twist")
    ptfe_group = empty("Layer_04_PTFE_Tape_Sleeves")
    foil_group = empty("Layer_05_Foil_Shield_Sleeves")
    bundle_group = empty("Layer_06_Neat_Four_Pair_Bundle")
    braid_group = empty("Layer_07_Non_Round_Outer_Braid")
    jacket_group = empty("Layer_08_Non_Round_Outer_Jacket")

    conductors = []
    insulation = []
    twist_guides = []
    ptfe_parts = []
    foil_parts = []

    for pair in range(4):
        for side in (-1, 1):
            path = wire_path(pair, side)
            wire_name = "Color" if side < 0 else "White"
            conductors.append(make_curve(f"Copper_Core_P{pair + 1}_{wire_name}", path, copper, 0.011))
            ins_mat = pair_mats[pair] if side < 0 else white
            insulation.append(make_curve(f"Insulated_Wire_P{pair + 1}_{wire_name}", path, ins_mat, 0.04))

        twist_guides.append(make_curve(
            f"Pair_{pair + 1}_Twist_Pitch_Guide",
            pair_wrap_path(pair, PAIR_SEP, PAIR_TURNS, math.radians(90)),
            copper,
            0.004,
            bevel_resolution=2,
        ))
        ptfe_parts.append(make_pair_sleeve(f"PTFE_Tube_Pair_{pair + 1}", pair, PAIR_WRAP_RADIUS, ptfe))
        ptfe_parts.append(make_curve(
            f"PTFE_Lap_Seam_Pair_{pair + 1}",
            pair_wrap_path(pair, PAIR_WRAP_RADIUS + 0.005, 5.8, math.radians(18)),
            ptfe_edge,
            0.005,
            bevel_resolution=2,
        ))
        foil_parts.append(make_pair_sleeve(f"Foil_Tube_Pair_{pair + 1}", pair, PAIR_WRAP_RADIUS + 0.035, foil))
        foil_parts.append(make_curve(
            f"Foil_Lap_Seam_Pair_{pair + 1}",
            pair_wrap_path(pair, PAIR_WRAP_RADIUS + 0.041, 4.8, math.radians(150)),
            foil_edge,
            0.006,
            bevel_resolution=2,
        ))

    parent_to(conductor_group, conductors)
    parent_to(insulation_group, insulation)
    parent_to(twist_group, twist_guides)
    parent_to(ptfe_group, ptfe_parts)
    parent_to(foil_group, foil_parts)

    fins = [
        make_spline_fin("XSpline_Vertical_Web", spline, (LENGTH * 0.92, 0.03, 1.06)),
        make_spline_fin("XSpline_Horizontal_Web", spline, (LENGTH * 0.92, 1.06, 0.03)),
    ]
    binder_lines = [
        make_curve(f"Bundle_Binder_NonRound_{i + 1}", superellipse_helix(0.76, 0.58, 2.15, math.tau * i / 4), binder, 0.005, bevel_resolution=2)
        for i in range(4)
    ]
    parent_to(bundle_group, fins + binder_lines)

    braid_wires = []
    carriers = 18
    for i in range(carriers):
        phase = math.tau * i / carriers
        mat = braid_a if i % 2 == 0 else braid_b
        braid_wires.append(make_curve(
            f"Braid_RH_NonRound_{i + 1:02d}",
            superellipse_helix(0.91, 0.66, 4.9, phase, handedness=1),
            mat,
            0.0065,
            bevel_resolution=2,
        ))
        braid_wires.append(make_curve(
            f"Braid_LH_NonRound_{i + 1:02d}",
            superellipse_helix(0.94, 0.68, 4.9, phase + math.pi / carriers, handedness=-1),
            mat,
            0.0065,
            bevel_resolution=2,
        ))
    parent_to(braid_group, braid_wires)

    jacket_shell = make_superellipse_shell("Outer_Jacket_Cutaway_NonRound", 0.99, 0.73, 1.18, 0.88, jacket)
    jacket_front_lip = make_superellipse_ring("Jacket_Front_Lip_NonRound", LENGTH / 2, 1.18, 0.88, jacket, 0.018)
    jacket_back_lip = make_superellipse_ring("Jacket_Back_Lip_NonRound", -LENGTH / 2, 1.18, 0.88, jacket, 0.018)
    parent_to(jacket_group, [jacket_shell, jacket_front_lip, jacket_back_lip])

    for group in (
        conductor_group,
        insulation_group,
        twist_group,
        ptfe_group,
        foil_group,
        bundle_group,
        braid_group,
        jacket_group,
    ):
        group.parent = root

    animate_layer(conductor_group, 1, 28)
    animate_layer(insulation_group, 32, 60)
    animate_layer(twist_group, 64, 90)
    animate_layer(ptfe_group, 94, 124)
    animate_layer(foil_group, 128, 158)
    animate_layer(bundle_group, 162, 194)
    animate_layer(braid_group, 198, 236)
    animate_layer(jacket_group, 240, 276)

    root.rotation_euler = (0, 0, math.radians(-7))
    root.keyframe_insert("rotation_euler", frame=1)
    root.rotation_euler = (math.radians(7), 0, math.radians(-7))
    root.keyframe_insert("rotation_euler", frame=288)

    bpy.ops.object.light_add(type="AREA", location=(0, -4.5, 3.6))
    light = bpy.context.object
    light.name = "Large_Softbox_Key_Light"
    light.data.energy = 880
    light.data.size = 5.4

    bpy.ops.object.light_add(type="POINT", location=(-2.8, 2.4, 1.8))
    rim = bpy.context.object
    rim.name = "Warm_Rim_Light"
    rim.data.energy = 86
    rim.data.color = (1.0, 0.52, 0.24)

    bpy.ops.mesh.primitive_plane_add(size=7.6, location=(0, 0, -1.12))
    floor = bpy.context.object
    floor.name = "Matte_Ground_Plane"
    floor.data.materials.append(floor_mat)

    bpy.ops.object.camera_add(location=(5.1, -6.35, 3.0))
    camera = bpy.context.object
    camera.name = "Camera_Highspeed_Neat_Bundle"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 5.15
    look_at(camera, Vector((0.05, 0, 0.03)))
    bpy.context.scene.camera = camera


def export_outputs() -> None:
    scene = bpy.context.scene
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    scene.frame_set(280)
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)

    for frame_path in FRAMES_DIR.glob("frame_*.png"):
        frame_path.unlink()
    scene.render.filepath = str(FRAMES_DIR / "frame_")
    bpy.ops.render.render(animation=True)

    scene.frame_set(1)
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        export_apply=True,
        export_animations=True,
        export_frame_range=True,
        export_current_frame=False,
        export_yup=True,
    )


if __name__ == "__main__":
    build_scene()
    export_outputs()
