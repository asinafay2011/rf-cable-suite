import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
OUT_BLEND = ROOT / "public" / "models" / "rf-link-budget-theater.blend"
OUT_GLB = ROOT / "public" / "models" / "rf-link-budget-theater.glb"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def make_mat(name, color, metallic=0.0, roughness=0.45, alpha=1.0, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Alpha"].default_value = alpha
        if emission:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = strength
    mat.blend_method = "BLEND" if alpha < 1 else "OPAQUE"
    mat.use_screen_refraction = alpha < 1
    mat.show_transparent_back = alpha < 1
    return mat


def assign(obj, mat):
    obj.data.materials.append(mat)
    return obj


def cube(name, loc, scale, mat, bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("soft chamfer", "BEVEL")
        mod.width = bevel
        mod.segments = 5
        obj.modifiers.new("weighted panel normals", "WEIGHTED_NORMAL")
    return assign(obj, mat)


def cyl_x(name, x, length, radius, mat, vertices=96, loc_y=0, loc_z=0):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=length,
        location=(x, loc_y, loc_z),
        rotation=(0, math.pi / 2, 0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.modifiers.new("smooth normals", "WEIGHTED_NORMAL")
    return assign(obj, mat)


def torus_x(name, x, radius, tube_radius, mat, loc_y=0, loc_z=0):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=radius,
        minor_radius=tube_radius,
        major_segments=128,
        minor_segments=12,
        location=(x, loc_y, loc_z),
        rotation=(0, math.pi / 2, 0),
    )
    obj = bpy.context.object
    obj.name = name
    return assign(obj, mat)


def make_curve(name, points, mat, bevel_depth=0.01, resolution=3):
    curve = bpy.data.curves.new(name, type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 4
    spl = curve.splines.new("POLY")
    spl.points.add(len(points) - 1)
    for p, co in zip(spl.points, points):
        p.co = (co[0], co[1], co[2], 1.0)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def helix(name, x0, x1, radius, turns, phase, mat, wire_radius=0.006, handed=1, y=0, z=0, steps=160):
    pts = []
    for i in range(steps):
        t = i / (steps - 1)
        x = x0 + (x1 - x0) * t
        a = phase + handed * turns * math.tau * t
        pts.append((x, y + radius * math.cos(a), z + radius * math.sin(a)))
    return make_curve(name, pts, mat, wire_radius)


def add_label(name, text, loc, size, mat, align="CENTER"):
    bpy.ops.object.text_add(location=loc, rotation=(math.radians(72), 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.body = text
    obj.data.align_x = align
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.extrude = 0.006
    obj.data.materials.append(mat)
    return obj


def build_scene():
    clear_scene()

    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.samples = 96
    bpy.context.scene.view_settings.view_transform = "Filmic"
    bpy.context.scene.view_settings.look = "Medium High Contrast"
    bpy.context.scene.unit_settings.system = "METRIC"

    black = make_mat("soft black PE jacket", (0.015, 0.014, 0.012, 1), 0.0, 0.76)
    panel = make_mat("anodized black instrument panels", (0.018, 0.023, 0.024, 1), 0.0, 0.52)
    panel_edge = make_mat("warm copper panel edge", (0.95, 0.43, 0.06, 1), 0.25, 0.34)
    copper = make_mat("polished copper conductor", (0.95, 0.42, 0.10, 1), 0.92, 0.18)
    brass = make_mat("brass connector collars", (0.90, 0.64, 0.20, 1), 0.85, 0.22)
    silver = make_mat("silver plated braid", (0.86, 0.82, 0.72, 1), 0.78, 0.28)
    braid_shadow = make_mat("braid shadow strand", (0.42, 0.34, 0.25, 1), 0.6, 0.45)
    dielectric = make_mat("foamed dielectric cream", (1.0, 0.88, 0.56, 1), 0.0, 0.48)
    glass = make_mat("transparent RF energy guide", (0.25, 0.95, 0.86, 0.26), 0.0, 0.18, alpha=0.26, emission=(0.04, 0.7, 0.65, 1), strength=0.15)
    tx_glow = make_mat("TX amber glow", (1.0, 0.55, 0.02, 1), 0.0, 0.24, emission=(1.0, 0.45, 0.02, 1), strength=1.25)
    rx_glow = make_mat("RX cyan glow", (0.10, 0.90, 0.72, 1), 0.0, 0.24, emission=(0.10, 0.90, 0.72, 1), strength=0.95)
    text_mat = make_mat("small engraved text", (0.98, 0.77, 0.28, 1), 0.0, 0.4, emission=(0.8, 0.45, 0.05, 1), strength=0.35)

    # TX / RX instruments.
    cube("TX instrument body", (-4.25, 0, 0), (1.16, 1.08, 1.18), panel, bevel=0.08)
    cube("TX amber face plate", (-3.66, 0, 0), (0.065, 0.88, 0.92), panel_edge, bevel=0.025)
    cube("RX instrument body", (4.25, 0, 0), (1.16, 1.08, 1.18), panel, bevel=0.08)
    cube("RX cyan face plate", (3.66, 0, 0), (0.065, 0.88, 0.92), rx_glow, bevel=0.025)
    add_label("TX label", "TX", (-4.30, -0.57, 0.55), 0.22, text_mat)
    add_label("RX label", "RX", (4.30, -0.57, 0.55), 0.22, rx_glow)

    # Connector launch hardware.
    cyl_x("TX port pin", -3.44, 0.48, 0.075, copper, vertices=64)
    cyl_x("RX port pin", 3.44, 0.48, 0.075, copper, vertices=64)
    for x in (-3.18, 3.18):
        cyl_x("brass connector shell", x, 0.34, 0.25, brass, vertices=96)
        torus_x("knurled connector rim", x - 0.18 if x < 0 else x + 0.18, 0.255, 0.018, brass)
        for k in range(6):
            torus_x("fine connector grip ridge", x + (-0.11 + 0.044 * k), 0.252, 0.005, panel_edge)

    # Cable macro cutaway.
    cyl_x("continuous copper center conductor", 0, 6.45, 0.055, copper, vertices=96)
    cyl_x("cream dielectric exposed core", 0, 5.05, 0.185, dielectric, vertices=128)
    cyl_x("left black cable jacket", -2.33, 1.58, 0.285, black, vertices=128)
    cyl_x("right black cable jacket", 2.33, 1.58, 0.285, black, vertices=128)
    cyl_x("translucent signal energy guide", 0, 5.65, 0.075, glass, vertices=96)

    for x in (-1.52, 1.52):
        torus_x("jacket cut lip", x, 0.286, 0.025, black)
        torus_x("foil glint under jacket", x * 0.96, 0.215, 0.008, brass)

    # Dense woven braid around the exposed section.
    carriers = 24
    for i in range(carriers):
        phase = math.tau * i / carriers
        helix(f"braid carrier right {i+1:02d}", -1.47, 1.47, 0.224, 2.8, phase, silver, 0.0048, handed=1)
        helix(f"braid carrier left {i+1:02d}", -1.47, 1.47, 0.230, 2.8, phase + math.pi / carriers, braid_shadow, 0.0048, handed=-1)

    # Signal pick-off rings that Three.js pulse can visually pass through.
    for i, x in enumerate((-2.25, 0.0, 2.25)):
        torus_x(f"RF flow marker ring {i+1}", x, 0.37, 0.012, tx_glow if i < 2 else rx_glow)

    # Subtle rails under the model, not a full floor plate.
    cube("warm shadow rail", (0, 0.43, -0.36), (7.2, 0.035, 0.035), panel_edge, bevel=0.01)
    cube("cool shadow rail", (0, -0.43, -0.36), (7.2, 0.035, 0.035), rx_glow, bevel=0.01)

    # Lighting and camera.
    bpy.ops.object.light_add(type="AREA", location=(-2.6, -3.2, 3.0))
    key = bpy.context.object
    key.name = "large softbox reflection"
    key.data.energy = 520
    key.data.size = 5.0

    bpy.ops.object.light_add(type="POINT", location=(-3.8, -0.35, 0.85))
    ltx = bpy.context.object
    ltx.name = "TX glow spill"
    ltx.data.color = (1.0, 0.48, 0.05)
    ltx.data.energy = 60

    bpy.ops.object.light_add(type="POINT", location=(3.8, 0.35, 0.85))
    lrx = bpy.context.object
    lrx.name = "RX glow spill"
    lrx.data.color = (0.1, 0.95, 0.75)
    lrx.data.energy = 45

    bpy.ops.object.camera_add(location=(0, -5.8, 2.15), rotation=(math.radians(68), 0, 0))
    cam = bpy.context.object
    bpy.context.scene.camera = cam
    cam.data.lens = 43

    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            try:
                bpy.ops.object.shade_smooth()
            except Exception:
                pass
            obj.select_set(False)


def main():
    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    build_scene()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        export_yup=True,
        export_materials="EXPORT",
        export_apply=True,
    )


if __name__ == "__main__":
    main()
