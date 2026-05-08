from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT / "public" / "models"
VIDEOS_DIR = ROOT / "public" / "videos"
RENDERS_DIR = ROOT / "public" / "cable-renders"

BLEND_PATH = MODELS_DIR / "rf-cable-layer-build.blend"
GLB_PATH = MODELS_DIR / "rf-cable-layer-build.glb"
MP4_PATH = VIDEOS_DIR / "rf-cable-layer-build.mp4"
FRAMES_DIR = VIDEOS_DIR / "rf-cable-layer-build-frames"
PREVIEW_PATH = RENDERS_DIR / "rf-cable-layer-build-preview.png"

LENGTH = 4.8
SEGMENTS = 112
# Keep a broad cutaway window facing the render camera (-Y side) so the
# conductor, dielectric, foil, braid, and jacket are visible in one view.
CUT_START = math.radians(235)
CUT_END = math.radians(485)


def ensure_dirs() -> None:
    for path in (MODELS_DIR, VIDEOS_DIR, FRAMES_DIR, RENDERS_DIR):
        path.mkdir(parents=True, exist_ok=True)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

    for collection in list(bpy.data.collections):
        if collection.users == 0:
            bpy.data.collections.remove(collection)


def set_render_settings() -> None:
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 210
    scene.frame_set(1)
    scene.render.fps = 24
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False

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
            ("gtao_factor", 1.25),
            ("use_bloom", True),
            ("bloom_intensity", 0.025),
        ):
            if hasattr(eevee, attr):
                setattr(eevee, attr, value)

    scene.world = bpy.data.worlds.new("Cable_Dark_World") if scene.world is None else scene.world
    scene.world.color = (0.015, 0.018, 0.02)

    scene.render.image_settings.file_format = "PNG"


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0,
    roughness: float = 0.4,
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
        mat.use_screen_refraction = True
        mat.show_transparent_back = True

    return mat


def make_annular_segment_mesh(
    name: str,
    inner_r: float,
    outer_r: float,
    material: bpy.types.Material,
    *,
    start_angle: float = CUT_START,
    end_angle: float = CUT_END,
    segments: int = SEGMENTS,
    length: float = LENGTH,
) -> bpy.types.Object:
    angles = [
        start_angle + (end_angle - start_angle) * i / segments
        for i in range(segments + 1)
    ]

    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []

    def add_ring(x: float, radius: float) -> list[int]:
        ids = []
        for a in angles:
            verts.append((x, radius * math.cos(a), radius * math.sin(a)))
            ids.append(len(verts) - 1)
        return ids

    x0 = -length / 2
    x1 = length / 2
    outer_back = add_ring(x0, outer_r)
    outer_front = add_ring(x1, outer_r)

    if inner_r > 0:
        inner_back = add_ring(x0, inner_r)
        inner_front = add_ring(x1, inner_r)
    else:
        verts.append((x0, 0, 0))
        center_back = len(verts) - 1
        verts.append((x1, 0, 0))
        center_front = len(verts) - 1
        inner_back = []
        inner_front = []

    for i in range(segments):
        faces.append([outer_back[i], outer_back[i + 1], outer_front[i + 1], outer_front[i]])

    if inner_r > 0:
        for i in range(segments):
            faces.append([inner_front[i], inner_front[i + 1], inner_back[i + 1], inner_back[i]])

        for i in range(segments):
            faces.append([outer_front[i], outer_front[i + 1], inner_front[i + 1], inner_front[i]])
            faces.append([outer_back[i + 1], outer_back[i], inner_back[i], inner_back[i + 1]])

        faces.append([outer_back[0], outer_front[0], inner_front[0], inner_back[0]])
        faces.append([outer_front[-1], outer_back[-1], inner_back[-1], inner_front[-1]])
    else:
        for i in range(segments):
            faces.append([center_front, outer_front[i], outer_front[i + 1]])
            faces.append([center_back, outer_back[i + 1], outer_back[i]])

        faces.append([center_back, center_front, outer_front[0], outer_back[0]])
        faces.append([center_front, center_back, outer_back[-1], outer_front[-1]])

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


def make_helix_curve(
    name: str,
    radius: float,
    angle0: float,
    turns: float,
    material: bpy.types.Material,
    *,
    handedness: int,
    bevel_depth: float = 0.012,
    points: int = 170,
    length: float = LENGTH,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 3

    spline = curve.splines.new("POLY")
    spline.points.add(points - 1)
    for i, point in enumerate(spline.points):
        t = i / (points - 1)
        x = -length / 2 + length * t
        theta = angle0 + handedness * turns * math.tau * t
        point.co = (x, radius * math.cos(theta), radius * math.sin(theta), 1)

    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(material)
    bpy.context.collection.objects.link(obj)
    return obj


def empty(name: str) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.2
    return obj


def parent_to(parent: bpy.types.Object, children: list[bpy.types.Object]) -> None:
    for child in children:
        child.parent = parent


def animate_layer(obj: bpy.types.Object, start: int, end: int, offset_x: float) -> None:
    obj.location = (offset_x, 0, 0)
    obj.scale = (0.96, 0.035, 0.035)
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


def make_text_label(
    body: str,
    loc: tuple[float, float, float],
    color_mat: bpy.types.Material,
    *,
    size: float = 0.085,
) -> bpy.types.Object:
    bpy.ops.object.text_add(location=loc, rotation=(math.radians(64), 0, math.radians(0)))
    obj = bpy.context.object
    obj.name = f"Label_{body.replace(' ', '_').replace('/', '_')}"
    obj.data.body = body
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.materials.append(color_mat)
    return obj


def build_scene() -> None:
    ensure_dirs()
    reset_scene()
    set_render_settings()

    copper = make_material("Copper - center conductor", (0.83, 0.41, 0.16, 1), metallic=0.7, roughness=0.28)
    copper_hi = make_material("Bright copper - braid highlights", (1.0, 0.62, 0.28, 1), metallic=0.85, roughness=0.22)
    dielectric = make_material("Foamed PE dielectric - translucent", (0.96, 0.84, 0.48, 1), roughness=0.26, alpha=0.62)
    foil = make_material("Aluminum foil shield", (0.78, 0.83, 0.86, 1), metallic=0.9, roughness=0.19)
    jacket = make_material("Matte black LSZH jacket", (0.025, 0.035, 0.04, 1), roughness=0.72)
    teal = make_material("Teal callout", (0.37, 0.92, 0.83, 1), emission=(0.18, 0.7, 0.65), emission_strength=0.18)
    amber = make_material("Amber callout", (0.98, 0.74, 0.17, 1), emission=(0.75, 0.42, 0.05), emission_strength=0.18)
    silver_line = make_material("Soft silver braid lines", (0.68, 0.72, 0.73, 1), metallic=0.72, roughness=0.3)

    root = empty("Cable_Assembly_Animated_Root")

    conductor_group = empty("Layer_01_Center_Conductor")
    conductor = make_annular_segment_mesh("Center_Conductor_Copper_Cutaway", 0.0, 0.19, copper)
    parent_to(conductor_group, [conductor])

    dielectric_group = empty("Layer_02_Foamed_PE_Dielectric")
    dielectric_obj = make_annular_segment_mesh("Foamed_PE_Dielectric_Cutaway", 0.20, 0.57, dielectric)
    parent_to(dielectric_group, [dielectric_obj])

    foil_group = empty("Layer_03_Aluminum_Foil_Shield")
    foil_obj = make_annular_segment_mesh("Aluminum_Foil_Shield_Cutaway", 0.59, 0.66, foil)
    seam = make_annular_segment_mesh("Foil_Overlap_Seam", 0.665, 0.69, foil, start_angle=math.radians(300), end_angle=math.radians(322), segments=8, length=LENGTH * 0.96)
    parent_to(foil_group, [foil_obj, seam])

    braid_group = empty("Layer_04_Tinned_Copper_Braid_Shield")
    braid_wires = []
    carriers = 18
    for i in range(carriers):
        mat = copper_hi if i % 2 == 0 else silver_line
        braid_wires.append(make_helix_curve(f"Braid_Strand_RH_{i + 1:02d}", 0.78, math.tau * i / carriers, 5.2, mat, handedness=1))
        braid_wires.append(make_helix_curve(f"Braid_Strand_LH_{i + 1:02d}", 0.84, math.tau * (i + 0.5) / carriers, 5.2, mat, handedness=-1))
    parent_to(braid_group, braid_wires)

    jacket_group = empty("Layer_05_Outer_Jacket_LSZH")
    jacket_obj = make_annular_segment_mesh("Outer_Jacket_LSZH_Cutaway", 0.88, 1.08, jacket)
    parent_to(jacket_group, [jacket_obj])

    for child in (conductor_group, dielectric_group, foil_group, braid_group, jacket_group):
        child.parent = root

    animate_layer(conductor_group, 1, 34, -0.45)
    animate_layer(dielectric_group, 36, 72, -0.55)
    animate_layer(foil_group, 74, 108, -0.62)
    animate_layer(braid_group, 110, 154, -0.72)
    animate_layer(jacket_group, 156, 194, -0.82)

    root.rotation_euler = (0, 0, math.radians(-6))
    root.keyframe_insert("rotation_euler", frame=1)
    root.rotation_euler = (math.radians(14), 0, math.radians(-6))
    root.keyframe_insert("rotation_euler", frame=210)

    bpy.ops.object.light_add(type="AREA", location=(0, -3.5, 3.4))
    key_light = bpy.context.object
    key_light.name = "Large_Softbox_Key_Light"
    key_light.data.energy = 700
    key_light.data.size = 5.0

    bpy.ops.object.light_add(type="POINT", location=(-2.8, 2.2, 1.6))
    rim_light = bpy.context.object
    rim_light.name = "Warm_Rim_Light"
    rim_light.data.energy = 90
    rim_light.data.color = (1.0, 0.56, 0.28)

    bpy.ops.object.camera_add(location=(4.8, -6.4, 3.35))
    camera = bpy.context.object
    camera.name = "Camera_Cutaway_ThreeQuarter"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 5.25
    camera.data.lens = 70
    look_at(camera, Vector((0.05, 0, 0.08)))
    bpy.context.scene.camera = camera

    # A dark receiver plane gives the silver and copper layers grounding without
    # becoming a decorative card in the rendered video.
    floor_mat = make_material("Charcoal floor", (0.02, 0.024, 0.026, 1), roughness=0.85)
    bpy.ops.mesh.primitive_plane_add(size=7.0, location=(0, 0.05, -1.12), rotation=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "Matte_Ground_Plane"
    floor.data.materials.append(floor_mat)


def export_outputs() -> None:
    scene = bpy.context.scene

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    scene.frame_set(200)
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)

    if FRAMES_DIR.exists():
        for frame_path in FRAMES_DIR.glob("frame_*.png"):
            frame_path.unlink()
    else:
        FRAMES_DIR.mkdir(parents=True, exist_ok=True)

    scene.render.image_settings.file_format = "PNG"
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
