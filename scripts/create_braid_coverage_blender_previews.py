from __future__ import annotations

import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
RENDER_DIR = ROOT / "public" / "cable-renders"
MODEL_DIR = ROOT / "public" / "models"
BLEND_PATH = MODEL_DIR / "braid-coverage-visual-library.blend"
GLB_PATH = MODEL_DIR / "braid-coverage-visual-library.glb"

RENDER_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)

VARIANTS = [
    {
        "key": "open",
        "file": "braid-coverage-open.png",
        "coverage": 62,
        "carriers": 8,
        "turns": 3.2,
        "wire": 0.018,
        "aperture": 0.42,
    },
    {
        "key": "general",
        "file": "braid-coverage-general.png",
        "coverage": 78,
        "carriers": 12,
        "turns": 4.0,
        "wire": 0.016,
        "aperture": 0.28,
    },
    {
        "key": "high",
        "file": "braid-coverage-high.png",
        "coverage": 91,
        "carriers": 18,
        "turns": 4.8,
        "wire": 0.014,
        "aperture": 0.16,
    },
    {
        "key": "dense",
        "file": "braid-coverage-dense.png",
        "coverage": 97,
        "carriers": 26,
        "turns": 5.8,
        "wire": 0.012,
        "aperture": 0.08,
    },
]


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for datablock in (bpy.data.curves, bpy.data.meshes, bpy.data.materials, bpy.data.lights):
        for item in list(datablock):
            if item.users == 0:
                datablock.remove(item)


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 72
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.color = (0.018, 0.019, 0.019)


def make_material(name: str, color, metallic=0.0, roughness=0.45, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Alpha"].default_value = alpha
    if alpha < 1:
        mat.blend_method = "BLEND"
        mat.use_screen_refraction = True
        mat.show_transparent_back = True
    return mat


def make_curve(name: str, points, material, bevel_depth: float, bevel_resolution=3):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = bevel_resolution
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (co[0], co[1], co[2], 1)
    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(material)
    bpy.context.collection.objects.link(obj)
    return obj


def add_cylinder(name: str, radius: float, length: float, material, location=(0, 0, 0), scale_z=1.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=radius, depth=length, location=location, rotation=(0, math.pi / 2, 0))
    obj = bpy.context.object
    obj.name = name
    obj.scale.z *= scale_z
    obj.data.materials.append(material)
    return obj


def helix_points(radius: float, length: float, turns: float, phase: float, handedness: int, samples=220):
    pts = []
    for i in range(samples + 1):
        t = i / samples
        x = -length / 2 + length * t
        angle = phase + handedness * turns * math.tau * t
        y = radius * math.cos(angle)
        z = radius * math.sin(angle)
        pts.append((x, y, z))
    return pts


def add_aperture_glows(count: int, radius: float, length: float, aperture: float, material) -> None:
    if count <= 0:
        return
    for i in range(count):
        t = (i + 0.5) / count
        x = -length * 0.43 + length * 0.86 * t
        angle = i * math.tau / count * 2.35
        y = radius * 1.006 * math.cos(angle)
        z = radius * 1.006 * math.sin(angle)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=aperture, location=(x, y, z))
        obj = bpy.context.object
        obj.name = f"Aperture_Glow_{i:02d}"
        obj.scale = (1.0, 0.18, 0.18)
        obj.rotation_euler[0] = angle
        obj.data.materials.append(material)


def add_floor(material) -> None:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.88))
    floor = bpy.context.object
    floor.name = "Soft reflective floor"
    floor.dimensions = (7.2, 3.6, 0.04)
    floor.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def add_lighting() -> None:
    bpy.ops.object.light_add(type="AREA", location=(-1.8, -4.2, 4.0))
    key = bpy.context.object
    key.name = "Large softbox"
    key.data.energy = 520
    key.data.size = 4.0
    bpy.ops.object.light_add(type="AREA", location=(3.6, 2.6, 2.6))
    rim = bpy.context.object
    rim.name = "Copper rim light"
    rim.data.energy = 90
    rim.data.size = 3.0


def add_camera() -> None:
    bpy.ops.object.camera_add(location=(4.8, -4.9, 2.8), rotation=(math.radians(62), 0, math.radians(43)))
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    direction = mathutils.Vector((0, 0, 0.05)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 58
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = 6.1
    camera.data.dof.aperture_fstop = 5.6


def build_variant(variant) -> None:
    length = 5.6
    core_r = 0.52
    braid_r = 0.64

    copper = make_material("Copper braid carriers", (0.95, 0.48, 0.20, 1), metallic=0.82, roughness=0.25)
    tin = make_material("Tinned braid carriers", (0.78, 0.79, 0.76, 1), metallic=0.86, roughness=0.28)
    core = make_material("Dark polymer core", (0.015, 0.021, 0.024, 1), metallic=0.0, roughness=0.42)
    foil = make_material("Semi-transparent foil underlayer", (0.62, 0.72, 0.74, 0.36), metallic=0.7, roughness=0.2, alpha=0.36)
    aperture = make_material("Warm aperture leakage", (1.0, 0.45, 0.12, 0.28), metallic=0.0, roughness=0.85, alpha=0.28)
    floor = make_material("Charcoal floor", (0.025, 0.027, 0.026, 1), metallic=0.0, roughness=0.38)

    add_floor(floor)
    add_cylinder("Cable core under braid", core_r, length + 0.35, core)
    add_cylinder("Foil reference layer", core_r * 1.03, length + 0.08, foil)

    carriers_per_direction = variant["carriers"]
    for i in range(carriers_per_direction):
        phase = i * math.tau / carriers_per_direction
        mat_a = copper if i % 2 == 0 else tin
        mat_b = tin if i % 2 == 0 else copper
        make_curve(
            f"S_Direction_Carrier_{i:02d}",
            helix_points(braid_r, length, variant["turns"], phase, 1),
            mat_a,
            variant["wire"],
        )
        make_curve(
            f"Z_Direction_Carrier_{i:02d}",
            helix_points(braid_r * 1.016, length, variant["turns"], phase + math.pi / carriers_per_direction, -1),
            mat_b,
            variant["wire"],
        )

    glow_count = 16 if variant["coverage"] < 70 else 10 if variant["coverage"] < 85 else 5 if variant["coverage"] < 95 else 0
    add_aperture_glows(glow_count, braid_r, length, variant["aperture"], aperture)

    add_lighting()
    add_camera()


def render_variant(variant) -> None:
    clear_scene()
    configure_scene()
    build_variant(variant)
    bpy.context.scene.render.filepath = str(RENDER_DIR / variant["file"])
    bpy.ops.render.render(write_still=True)


def main() -> None:
    for variant in VARIANTS:
        render_variant(variant)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    try:
        bpy.ops.export_scene.gltf(filepath=str(GLB_PATH), export_format="GLB")
    except Exception as exc:
        print(f"GLB export skipped: {exc}")


if __name__ == "__main__":
    import mathutils

    main()
