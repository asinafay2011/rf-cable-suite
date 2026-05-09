from __future__ import annotations

import math
from pathlib import Path

import bpy
import mathutils


ROOT = Path(__file__).resolve().parents[1]
RENDER_DIR = ROOT / "public" / "cable-renders"
MODEL_DIR = ROOT / "public" / "models"
BLEND_PATH = MODEL_DIR / "suckout-pitch-visual-library.blend"
GLB_PATH = MODEL_DIR / "suckout-pitch-visual-library.glb"

RENDER_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)


VARIANTS = [
    {
        "key": "ptfe",
        "file": "suckout-ptfe-stack.png",
        "layers": [
            {"kind": "ptfe", "turns": 4.5, "width": 0.58, "phase": 0.0, "hand": 1},
            {"kind": "ptfe", "turns": 4.5, "width": 0.58, "phase": math.pi, "hand": -1},
            {"kind": "ptfe", "turns": 4.5, "width": 0.54, "phase": math.pi / 2, "hand": 1},
        ],
        "marker_pitch": 0.76,
    },
    {
        "key": "staggered",
        "file": "suckout-staggered-stack.png",
        "layers": [
            {"kind": "ptfe_a", "turns": 3.8, "width": 0.50, "phase": 0.2, "hand": 1},
            {"kind": "ptfe_b", "turns": 4.6, "width": 0.46, "phase": 1.6, "hand": -1},
            {"kind": "ptfe_c", "turns": 5.4, "width": 0.42, "phase": 2.8, "hand": 1},
        ],
        "marker_pitch": 0.64,
    },
    {
        "key": "foil",
        "file": "suckout-foil-seam.png",
        "layers": [
            {"kind": "ptfe", "turns": 4.0, "width": 0.52, "phase": 0.0, "hand": 1},
            {"kind": "foil", "turns": 3.2, "width": 0.82, "phase": 0.55, "hand": 1},
            {"kind": "seam", "turns": 3.2, "width": 0.045, "phase": 0.92, "hand": 1},
        ],
        "marker_pitch": 0.98,
    },
    {
        "key": "spiral",
        "file": "suckout-spiral-shield.png",
        "layers": [
            {"kind": "ptfe", "turns": 4.2, "width": 0.52, "phase": 0.0, "hand": 1},
            {"kind": "spiral", "turns": 5.2, "width": 0.072, "phase": 0.0, "hand": 1, "bobbins": 8},
        ],
        "marker_pitch": 0.34,
    },
    {
        "key": "full",
        "file": "suckout-full-shield-stack.png",
        "layers": [
            {"kind": "ptfe_a", "turns": 4.0, "width": 0.48, "phase": 0.1, "hand": 1},
            {"kind": "ptfe_b", "turns": 4.7, "width": 0.44, "phase": 1.4, "hand": -1},
            {"kind": "foil", "turns": 3.4, "width": 0.78, "phase": 0.6, "hand": 1},
            {"kind": "braid", "turns": 4.8, "wire": 0.009, "carriers": 18},
        ],
        "marker_pitch": 0.46,
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
    scene.cycles.samples = 64
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.color = (0.018, 0.019, 0.019)


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


def make_ribbon(name: str, radius: float, length: float, turns: float, phase: float, width: float, material, handedness=1, samples=260):
    verts = []
    faces = []
    dx_total = length
    ds_total = handedness * radius * turns * math.tau
    denom = max(1e-6, math.hypot(dx_total, ds_total))
    perp_x = -ds_total / denom
    perp_s = dx_total / denom

    for i in range(samples + 1):
        t = i / samples
        x = -length / 2 + length * t
        theta = phase + handedness * turns * math.tau * t
        for sign in (-1, 1):
            x_edge = x + sign * perp_x * width / 2
            theta_edge = theta + sign * (perp_s * width / 2) / radius
            verts.append((x_edge, radius * math.cos(theta_edge), radius * math.sin(theta_edge)))

    for i in range(samples):
        a = i * 2
        faces.append((a, a + 1, a + 3, a + 2))

    mesh = bpy.data.meshes.new(name + "_mesh")
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


def helix_points(radius: float, length: float, turns: float, phase: float, handedness: int, samples=220):
    pts = []
    for i in range(samples + 1):
        t = i / samples
        x = -length / 2 + length * t
        angle = phase + handedness * turns * math.tau * t
        pts.append((x, radius * math.cos(angle), radius * math.sin(angle)))
    return pts


def add_cylinder(name: str, radius: float, length: float, material, location=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=radius, depth=length, location=location, rotation=(0, math.pi / 2, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return obj


def add_pitch_markers(length: float, radius: float, pitch: float, material) -> None:
    count = max(3, min(12, int(length / max(0.2, pitch))))
    usable = length * 0.82
    for i in range(count):
        x = -usable / 2 + (usable * i / max(1, count - 1))
        bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=0.005, major_segments=88, minor_segments=8, location=(x, 0, 0), rotation=(0, math.pi / 2, 0))
        obj = bpy.context.object
        obj.name = f"Pitch_Notch_Marker_{i:02d}"
        obj.data.materials.append(material)


def add_floor(material) -> None:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.78))
    floor = bpy.context.object
    floor.name = "Matte analyzer floor"
    floor.dimensions = (7.0, 3.4, 0.04)
    floor.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def add_lighting() -> None:
    bpy.ops.object.light_add(type="AREA", location=(-2.0, -4.6, 4.4))
    key = bpy.context.object
    key.name = "Large softbox"
    key.data.energy = 560
    key.data.size = 4.2
    bpy.ops.object.light_add(type="AREA", location=(3.4, 2.8, 2.5))
    rim = bpy.context.object
    rim.name = "Warm rim"
    rim.data.energy = 100
    rim.data.size = 2.5


def add_camera() -> None:
    bpy.ops.object.camera_add(location=(4.6, -4.8, 2.45))
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    direction = mathutils.Vector((0.0, 0.0, 0.05)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 62
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = 6.0
    camera.data.dof.aperture_fstop = 6.3


def build_variant(variant) -> None:
    length = 5.7
    core_r = 0.44
    current_r = 0.49
    mats = {
        "floor": make_material("Charcoal floor", (0.023, 0.025, 0.024, 1), roughness=0.4),
        "conductor": make_material("Copper conductor", (0.93, 0.46, 0.19, 1), metallic=0.76, roughness=0.24),
        "dielectric": make_material("PTFE core", (0.86, 0.80, 0.68, 1), roughness=0.55),
        "ptfe": make_material("Translucent PTFE tape", (0.88, 0.92, 0.86, 0.52), roughness=0.36, alpha=0.52),
        "ptfe_a": make_material("Warm PTFE tape", (0.95, 0.83, 0.56, 0.48), roughness=0.36, alpha=0.48),
        "ptfe_b": make_material("Cool PTFE tape", (0.64, 0.92, 0.86, 0.46), roughness=0.36, alpha=0.46),
        "ptfe_c": make_material("Blue PTFE tape", (0.58, 0.74, 1.0, 0.44), roughness=0.36, alpha=0.44),
        "foil": make_material("Aluminum foil wrap", (0.78, 0.82, 0.82, 0.84), metallic=0.82, roughness=0.22, alpha=0.84),
        "seam": make_material("Foil seam glow", (1.0, 0.55, 0.12, 0.74), roughness=0.6, alpha=0.74, emission=((1.0, 0.32, 0.08, 1), 0.45)),
        "spiral": make_material("Silver plated flatwire spiral", (0.92, 0.92, 0.88, 1), metallic=0.88, roughness=0.2),
        "braid_a": make_material("Copper braid", (0.94, 0.52, 0.22, 1), metallic=0.82, roughness=0.24),
        "braid_b": make_material("Tinned braid", (0.78, 0.80, 0.78, 1), metallic=0.86, roughness=0.27),
        "marker": make_material("Predicted notch period", (1.0, 0.28, 0.08, 0.58), roughness=0.6, alpha=0.58, emission=((1.0, 0.18, 0.04, 1), 0.55)),
    }

    add_floor(mats["floor"])
    add_cylinder("Center conductor", core_r * 0.45, length + 0.35, mats["conductor"])
    add_cylinder("Dielectric under wrap", core_r, length + 0.25, mats["dielectric"])

    for layer in variant["layers"]:
        kind = layer["kind"]
        if kind == "braid":
            carriers = layer.get("carriers", 18)
            radius = current_r + 0.055
            for i in range(carriers):
                phase = i * math.tau / carriers
                make_curve(f"Braid_S_{i:02d}", helix_points(radius, length, layer["turns"], phase, 1), mats["braid_a"] if i % 2 else mats["braid_b"], layer["wire"], 2)
                make_curve(f"Braid_Z_{i:02d}", helix_points(radius * 1.016, length, layer["turns"], phase + math.pi / carriers, -1), mats["braid_b"] if i % 2 else mats["braid_a"], layer["wire"], 2)
            current_r = radius + 0.03
            continue

        if kind == "spiral":
            bobbins = layer.get("bobbins", 8)
            for i in range(bobbins):
                phase = layer["phase"] + i * math.tau / bobbins
                make_ribbon(f"Spiral_Flatwire_{i:02d}", current_r, length, layer["turns"], phase, layer["width"], mats["spiral"], layer.get("hand", 1))
            current_r += 0.045
            continue

        make_ribbon(
            f"{kind}_helical_wrap",
            current_r,
            length,
            layer["turns"],
            layer["phase"],
            layer["width"],
            mats.get(kind, mats["ptfe"]),
            layer.get("hand", 1),
        )
        current_r += 0.035 if kind.startswith("ptfe") else 0.045

    add_pitch_markers(length, current_r + 0.055, variant["marker_pitch"], mats["marker"])
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
    main()
