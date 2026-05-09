from __future__ import annotations

import math
from pathlib import Path

import bpy
import mathutils


ROOT = Path(__file__).resolve().parents[1]
RENDER_DIR = ROOT / "public" / "cable-renders"
MODEL_DIR = ROOT / "public" / "models"
BLEND_PATH = MODEL_DIR / "lay-next-visual-library.blend"
GLB_PATH = MODEL_DIR / "lay-next-visual-library.glb"

RENDER_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)

PAIR_COLORS = [
    ((0.25, 0.55, 1.0, 1), (0.93, 0.96, 1.0, 1)),
    ((1.0, 0.48, 0.16, 1), (0.96, 0.92, 0.86, 1)),
    ((0.26, 0.82, 0.56, 1), (0.94, 0.96, 0.90, 1)),
    ((0.70, 0.46, 0.18, 1), (0.95, 0.92, 0.84, 1)),
]

VARIANTS = [
    {
        "key": "identical",
        "file": "lay-next-identical.png",
        "lays": [13, 13, 13, 13],
        "bundle_turns": 0.9,
        "pair_radius": 0.165,
        "bundle_radius": 0.66,
        "signal_strength": 1.0,
        "risk": "high",
    },
    {
        "key": "slight",
        "file": "lay-next-slight.png",
        "lays": [12, 13, 14, 15],
        "bundle_turns": 0.75,
        "pair_radius": 0.165,
        "bundle_radius": 0.68,
        "signal_strength": 0.62,
        "risk": "medium",
    },
    {
        "key": "varied",
        "file": "lay-next-varied.png",
        "lays": [11, 13, 15, 17],
        "bundle_turns": 0.65,
        "pair_radius": 0.155,
        "bundle_radius": 0.72,
        "signal_strength": 0.28,
        "risk": "low",
    },
    {
        "key": "tight",
        "file": "lay-next-tight-bundle.png",
        "lays": [11, 13, 15, 17],
        "bundle_turns": 1.8,
        "pair_radius": 0.19,
        "bundle_radius": 0.48,
        "signal_strength": 0.72,
        "risk": "crush",
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
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.color = (0.017, 0.018, 0.018)


def make_material(name: str, color, metallic=0.0, roughness=0.45, alpha=1.0, emission=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Alpha"].default_value = alpha
    if emission:
        bsdf.inputs["Emission Color"].default_value = emission[0]
        bsdf.inputs["Emission Strength"].default_value = emission[1]
    if alpha < 1:
        mat.blend_method = "BLEND"
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


def pair_wire_points(length: float, lay_mm: float, pair_phase: float, bundle_phase: float, bundle_radius: float, pair_radius: float, sign: int, samples=320):
    pts = []
    # Scale mm-style lay lengths into readable scene turns. Shorter lay = more turns.
    pair_turns = length / max(0.35, lay_mm * 0.072)
    for i in range(samples + 1):
        t = i / samples
        x = -length / 2 + length * t
        bundle_angle = bundle_phase + t * bundle_turns_global * math.tau
        center_y = bundle_radius * math.cos(bundle_angle)
        center_z = bundle_radius * math.sin(bundle_angle)

        radial = mathutils.Vector((0, math.cos(bundle_angle), math.sin(bundle_angle)))
        tangent = mathutils.Vector((0, -math.sin(bundle_angle), math.cos(bundle_angle)))
        twist = pair_phase + pair_turns * math.tau * t
        local = radial * (math.cos(twist) * pair_radius * sign) + tangent * (math.sin(twist) * pair_radius * sign)
        pts.append((x, center_y + local.y, center_z + local.z))
    return pts


def centerline_points(length: float, bundle_phase: float, bundle_radius: float, samples=160):
    pts = []
    for i in range(samples + 1):
        t = i / samples
        x = -length / 2 + length * t
        bundle_angle = bundle_phase + t * bundle_turns_global * math.tau
        pts.append((x, bundle_radius * math.cos(bundle_angle), bundle_radius * math.sin(bundle_angle)))
    return pts


def add_spline(length: float, radius: float, material) -> None:
    # Four soft ribs along the cable axis showing the X-spline separation.
    for phase in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
        pts = []
        for i in range(180):
            t = i / 179
            x = -length / 2 + length * t
            angle = phase + t * bundle_turns_global * math.tau
            pts.append((x, radius * math.cos(angle), radius * math.sin(angle)))
        make_curve(f"Cross_Spline_Rib_{phase:.1f}", pts, material, 0.018, 2)


def add_outer_jacket(length: float, radius: float, material) -> None:
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=radius, depth=length, rotation=(0, math.pi / 2, 0), location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = "Transparent jacket boundary"
    obj.data.materials.append(material)
    bpy.ops.object.shade_smooth()


def add_coupling_glow(length: float, radius: float, active_phase: float, other_phase: float, strength: float, material, name: str):
    # Draw a translucent coupling bridge between pair centerlines.
    pts = []
    samples = 120
    for i in range(samples + 1):
        t = i / samples
        x = -length / 2 + length * t
        angle_a = active_phase + t * bundle_turns_global * math.tau
        angle_b = other_phase + t * bundle_turns_global * math.tau
        mix = 0.5 + 0.12 * math.sin(t * math.tau * 3)
        y = radius * ((1 - mix) * math.cos(angle_a) + mix * math.cos(angle_b))
        z = radius * ((1 - mix) * math.sin(angle_a) + mix * math.sin(angle_b))
        pts.append((x, y, z))
    make_curve(name, pts, material, 0.012 + strength * 0.018, 5)


def add_floor(material) -> None:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -1.16))
    floor = bpy.context.object
    floor.name = "NEXT analyzer floor"
    floor.dimensions = (7.6, 3.5, 0.04)
    floor.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def add_lighting() -> None:
    bpy.ops.object.light_add(type="AREA", location=(-2.4, -4.6, 4.3))
    key = bpy.context.object
    key.name = "Large softbox"
    key.data.energy = 580
    key.data.size = 4.5
    bpy.ops.object.light_add(type="AREA", location=(3.2, 2.7, 2.3))
    rim = bpy.context.object
    rim.name = "Blue crosstalk rim"
    rim.data.energy = 120
    rim.data.size = 2.8


def add_camera() -> None:
    bpy.ops.object.camera_add(location=(4.9, -5.2, 2.7))
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    direction = mathutils.Vector((0, 0, 0.02)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 58
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = 6.5
    camera.data.dof.aperture_fstop = 6.0


def build_variant(variant) -> None:
    global bundle_turns_global
    bundle_turns_global = variant["bundle_turns"]
    length = 5.8
    bundle_radius = variant["bundle_radius"]
    pair_radius = variant["pair_radius"]
    phases = [math.pi / 2, 0, -math.pi / 2, math.pi]

    mats = {
        "floor": make_material("Charcoal floor", (0.023, 0.025, 0.024, 1), roughness=0.42),
        "spline": make_material("Polymer X spline", (0.08, 0.11, 0.12, 1), roughness=0.58),
        "jacket": make_material("Transparent jacket", (0.58, 0.70, 0.75, 0.18), roughness=0.22, alpha=0.18),
        "active": make_material("Active signal copper", (1.0, 0.48, 0.12, 1), metallic=0.55, roughness=0.22, emission=((1.0, 0.18, 0.04, 1), 0.12)),
        "glow_good": make_material("Low NEXT field", (0.20, 1.0, 0.82, 0.35), roughness=0.8, alpha=0.35, emission=((0.12, 0.9, 0.72, 1), 0.5)),
        "glow_warn": make_material("Warning NEXT field", (1.0, 0.70, 0.12, 0.48), roughness=0.8, alpha=0.48, emission=((1.0, 0.42, 0.03, 1), 0.65)),
        "glow_bad": make_material("Bad NEXT field", (1.0, 0.18, 0.10, 0.62), roughness=0.8, alpha=0.62, emission=((1.0, 0.04, 0.02, 1), 0.85)),
        "crush": make_material("Crush contact highlight", (1.0, 0.12, 0.06, 0.58), roughness=0.7, alpha=0.58, emission=((1.0, 0.03, 0.01, 1), 0.75)),
    }

    pair_mats = []
    for i, (a, b) in enumerate(PAIR_COLORS):
        pair_mats.append((
            make_material(f"P{i+1} color insulation", a, roughness=0.42),
            make_material(f"P{i+1} white mate", b, roughness=0.42),
        ))

    add_floor(mats["floor"])
    add_spline(length, bundle_radius * 0.46, mats["spline"])
    add_outer_jacket(length + 0.18, bundle_radius + pair_radius * 1.8, mats["jacket"])

    for i, lay in enumerate(variant["lays"]):
        pair_phase = 0 if variant["key"] == "identical" else (i * math.pi / 5)
        mat_a, mat_b = pair_mats[i]
        if i == 0:
            mat_a = mats["active"]
        make_curve(
            f"Pair_{i+1}_wire_A_lay_{lay}",
            pair_wire_points(length, lay, pair_phase, phases[i], bundle_radius, pair_radius, 1),
            mat_a,
            0.028,
            4,
        )
        make_curve(
            f"Pair_{i+1}_wire_B_lay_{lay}",
            pair_wire_points(length, lay, pair_phase + math.pi, phases[i], bundle_radius, pair_radius, -1),
            mat_b,
            0.028,
            4,
        )
        make_curve(f"Pair_{i+1}_centerline", centerline_points(length, phases[i], bundle_radius), mats["spline"], 0.004, 1)

    glow_key = "glow_bad" if variant["risk"] in ("high", "crush") else "glow_warn" if variant["risk"] == "medium" else "glow_good"
    for i in (1, 2, 3):
        strength = variant["signal_strength"] * (1.0 - 0.13 * i)
        add_coupling_glow(length, bundle_radius * 0.82, phases[0], phases[i], strength, mats[glow_key], f"NEXT_Field_P1_to_P{i+1}")

    if variant["risk"] == "crush":
        for phase in phases:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.14, location=(0.2, bundle_radius * 0.72 * math.cos(phase), bundle_radius * 0.72 * math.sin(phase)))
            obj = bpy.context.object
            obj.name = "Crush warning contact"
            obj.scale = (1.6, 0.32, 0.32)
            obj.data.materials.append(mats["crush"])

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


bundle_turns_global = 0.8

if __name__ == "__main__":
    main()
