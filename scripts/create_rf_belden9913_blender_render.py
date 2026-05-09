from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
RENDERS_DIR = ROOT / "public" / "cable-renders"
OUTPUT_PATH = RENDERS_DIR / "rf-belden9913-airspace.png"


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def set_render_settings() -> None:
    scene = bpy.context.scene
    scene.render.resolution_x = 1680
    scene.render.resolution_y = 900
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

    scene.world = bpy.data.worlds.new("Belden9913_World") if scene.world is None else scene.world
    scene.world.color = (0.004, 0.004, 0.005)


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0,
    roughness: float = 0.4,
    alpha: float = 1,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (color[0], color[1], color[2], alpha)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], alpha)
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metallic
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
    if alpha < 1:
        mat.blend_method = "BLEND"
        mat.show_transparent_back = True
    return mat


def cylinder_x(
    name: str,
    x: float,
    length: float,
    radius: float,
    mat: bpy.types.Material,
    *,
    vertices: int = 128,
    loc_y: float = 0,
    loc_z: float = 0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=length,
        location=(x, loc_y, loc_z),
        rotation=(0, math.radians(90), 0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def helix_curve(
    name: str,
    x0: float,
    x1: float,
    radius: float,
    turns: float,
    phase: float,
    mat: bpy.types.Material,
    *,
    handedness: int = 1,
    bevel_depth: float = 0.012,
    points: int = 190,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(points - 1)
    for i, point in enumerate(spline.points):
        t = i / (points - 1)
        x = x0 + (x1 - x0) * t
        a = phase + handedness * turns * math.tau * t
        point.co = (x, radius * math.cos(a), radius * math.sin(a), 1)
    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return obj


def add_stranded_center(x: float, length: float, copper: bpy.types.Material) -> None:
    wire_r = 0.06
    bundle_r = 0.15
    cylinder_x("Center strand core", x, length, wire_r, copper, vertices=32)
    for i in range(6):
        a = math.tau * i / 6
        cylinder_x(
            f"Center strand {i + 1}",
            x,
            length,
            wire_r,
            copper,
            vertices=32,
            loc_y=bundle_r * math.cos(a),
            loc_z=bundle_r * math.sin(a),
        )


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_scene() -> None:
    RENDERS_DIR.mkdir(parents=True, exist_ok=True)
    reset_scene()
    set_render_settings()

    copper = material("Bare copper", (0.92, 0.43, 0.15, 1), metallic=0.72, roughness=0.23)
    jacket = material("Black UV PE jacket", (0.006, 0.007, 0.007, 1), roughness=0.82)
    jacket_cut = material("Cut jacket edge", (0.035, 0.038, 0.04, 1), roughness=0.7)
    foil = material("Duofoil shield", (0.72, 0.74, 0.73, 1), metallic=0.9, roughness=0.18)
    foil_dark = material("Duofoil crinkle", (0.42, 0.43, 0.42, 1), metallic=0.8, roughness=0.25)
    braid_a = material("Tinned copper braid bright", (0.78, 0.78, 0.72, 1), metallic=0.88, roughness=0.2)
    braid_b = material("Tinned copper braid shade", (0.42, 0.43, 0.40, 1), metallic=0.78, roughness=0.24)
    foam = material("Air spaced foam PE", (0.88, 0.86, 0.78, 1), roughness=0.32, alpha=0.62)
    spacer = material("PE spacer ribs", (0.95, 0.94, 0.86, 1), roughness=0.35)
    floor_mat = material("Black glass floor", (0.002, 0.002, 0.002, 1), roughness=0.38)

    # Staggered stripped cable, left-to-right: jacket, braid, foil, air-spaced dielectric, conductor.
    cylinder_x("Outer jacket long body", -1.85, 3.8, 1.08, jacket)
    cylinder_x("Outer jacket cut lip", 0.05, 0.12, 1.1, jacket_cut)

    braid_x0, braid_x1 = -0.2, 1.15
    for i in range(18):
        phase = math.tau * i / 18
        mat = braid_a if i % 2 == 0 else braid_b
        helix_curve(f"Braid right hand {i + 1}", braid_x0, braid_x1, 0.9, 2.25, phase, mat, handedness=1, bevel_depth=0.012)
        helix_curve(f"Braid left hand {i + 1}", braid_x0, braid_x1, 0.96, 2.25, phase + 0.2, mat, handedness=-1, bevel_depth=0.012)

    cylinder_x("Duofoil exposed wrap", 1.2, 0.85, 0.8, foil)
    for i in range(18):
        x = 0.82 + i * 0.04
        strip = cylinder_x(f"Foil crinkle {i + 1}", x, 0.018, 0.815 + 0.012 * math.sin(i), foil_dark, vertices=48)
        strip.rotation_euler.x = math.radians(4 * math.sin(i * 1.7))

    cylinder_x("Translucent air foam dielectric", 2.02, 1.0, 0.66, foam)
    for i in range(4):
        helix_curve(
            f"Air spacer rib {i + 1}",
            1.55,
            2.48,
            0.36,
            1.25,
            math.tau * i / 4,
            spacer,
            handedness=1,
            bevel_depth=0.032,
            points=110,
        )

    add_stranded_center(2.78, 1.28, copper)

    bpy.ops.mesh.primitive_plane_add(size=8.0, location=(0, 0, -1.18))
    floor = bpy.context.object
    floor.name = "Reflective dark bench"
    floor.data.materials.append(floor_mat)

    bpy.ops.object.light_add(type="AREA", location=(-1.4, -4.2, 4.2))
    key = bpy.context.object
    key.name = "Large softbox"
    key.data.energy = 780
    key.data.size = 4.6

    bpy.ops.object.light_add(type="POINT", location=(3.1, -2.0, 1.8))
    rim = bpy.context.object
    rim.name = "Warm copper rim"
    rim.data.energy = 90
    rim.data.color = (1.0, 0.55, 0.28)

    bpy.ops.object.camera_add(location=(4.8, -5.2, 2.45))
    camera = bpy.context.object
    camera.name = "Camera_Belden9913"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.65
    look_at(camera, Vector((0.48, 0, 0.0)))
    bpy.context.scene.camera = camera


def render() -> None:
    bpy.context.scene.frame_set(1)
    bpy.context.scene.render.filepath = str(OUTPUT_PATH)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    build_scene()
    render()
