import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "public" / "models" / "corgi-assistant.glb"


def mat(name, color, roughness=0.55, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return material


def shade_smooth(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    obj.select_set(False)


def sphere(name, loc, scale, material, segments=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    shade_smooth(obj)
    return obj


def cyl(name, loc, radius, depth, material, rotation=(0, 0, 0), vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    shade_smooth(obj)
    return obj


def cone(name, loc, radius1, radius2, depth, material, rotation=(0, 0, 0), vertices=4):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    shade_smooth(obj)
    return obj


def cube(name, loc, scale, material):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    return obj


def torus(name, loc, major, minor, material, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=48, minor_segments=8, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    shade_smooth(obj)
    return obj


def make_corgi():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

    orange = mat("corgi warm orange coat", (0.93, 0.44, 0.13, 1), 0.48)
    orange_dark = mat("corgi shaded orange", (0.56, 0.20, 0.06, 1), 0.58)
    cream = mat("corgi cream chest muzzle paws", (1.0, 0.88, 0.64, 1), 0.62)
    black = mat("soft black nose eyes", (0.025, 0.019, 0.014, 1), 0.38)
    amber = mat("assistant amber collar", (1.0, 0.58, 0.05, 1), 0.34)
    teal = mat("rf teal tag glow", (0.18, 0.92, 0.82, 1), 0.25)

    # Body and chest are slightly flattened so the mascot reads well at 90px.
    sphere("Corgi body rounded low-poly", (0.18, 0.0, 0.52), (0.82, 0.36, 0.34), orange, 32, 14)
    sphere("Cream belly patch", (-0.02, -0.18, 0.45), (0.43, 0.055, 0.23), cream, 24, 10)
    sphere("Corgi head", (-0.62, -0.03, 0.82), (0.34, 0.31, 0.32), orange, 32, 16)
    sphere("Cream face mask", (-0.70, -0.31, 0.80), (0.22, 0.055, 0.22), cream, 24, 10)
    sphere("Cream muzzle", (-0.70, -0.38, 0.70), (0.18, 0.08, 0.11), cream, 24, 10)

    # Ears: big triangular corgi ears.
    cone("Left corgi ear", (-0.78, -0.02, 1.15), 0.15, 0.02, 0.42, orange_dark, rotation=(0.1, 0.2, -0.35), vertices=4)
    cone("Right corgi ear", (-0.47, -0.02, 1.14), 0.15, 0.02, 0.42, orange_dark, rotation=(-0.08, -0.22, 0.35), vertices=4)
    cone("Left cream inner ear", (-0.78, -0.055, 1.13), 0.085, 0.01, 0.27, cream, rotation=(0.1, 0.2, -0.35), vertices=4)
    cone("Right cream inner ear", (-0.47, -0.055, 1.12), 0.085, 0.01, 0.27, cream, rotation=(-0.08, -0.22, 0.35), vertices=4)

    # Face details placed on the forward side so the launcher camera can see them.
    sphere("Left glossy eye", (-0.76, -0.335, 0.86), (0.035, 0.018, 0.045), black, 16, 8)
    sphere("Right glossy eye", (-0.56, -0.335, 0.86), (0.035, 0.018, 0.045), black, 16, 8)
    sphere("Heart nose", (-0.66, -0.445, 0.73), (0.052, 0.028, 0.034), black, 16, 8)

    # Stubby legs and paws.
    for idx, x in enumerate([-0.25, 0.52]):
        cyl(f"front back leg {idx + 1}", (x, -0.18, 0.19), 0.075, 0.28, orange_dark, vertices=18)
        sphere(f"cream paw {idx + 1}", (x, -0.24, 0.06), (0.105, 0.065, 0.045), cream, 16, 8)
    for idx, x in enumerate([-0.28, 0.50]):
        cyl(f"far leg {idx + 1}", (x, 0.19, 0.20), 0.058, 0.24, orange_dark, vertices=16)

    # Curled corgi tail, readable from the side.
    torus("curled corgi tail", (0.92, 0.02, 0.77), 0.13, 0.032, orange, rotation=(math.pi / 2, 0, 0))
    sphere("tail highlight", (0.90, -0.12, 0.82), (0.06, 0.04, 0.045), cream, 16, 8)

    # RF assistant collar and small tag.
    torus("amber assistant collar", (-0.40, -0.02, 0.70), 0.23, 0.018, amber, rotation=(math.pi / 2, 0, 0))
    cyl("round rf tag", (-0.38, -0.30, 0.58), 0.065, 0.018, teal, rotation=(math.pi / 2, 0, 0), vertices=32)
    cube("tag mark vertical", (-0.38, -0.311, 0.58), (0.006, 0.003, 0.045), black)
    cube("tag mark dot", (-0.38, -0.313, 0.52), (0.018, 0.003, 0.006), black)

    # A subtle floorless contact shadow baked as a soft dark oval under the paws.
    shadow = mat("transparent mascot contact shadow", (0.02, 0.018, 0.015, 0.32), 0.85)
    shadow.blend_method = "BLEND"
    shadow.use_nodes = True
    shadow.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.32
    cube("soft contact shadow card", (0.17, 0.02, -0.005), (0.82, 0.26, 0.004), shadow)

    # Camera/lighting are exported too; runtime has its own lights but this helps previewing the asset.
    bpy.ops.object.light_add(type="AREA", location=(-2.6, -3.4, 4.0))
    bpy.context.object.name = "preview softbox"
    bpy.context.object.data.energy = 450
    bpy.context.object.data.size = 4.0

    bpy.ops.object.camera_add(location=(0.0, -4.4, 1.08), rotation=(math.radians(78), 0, 0))
    bpy.context.scene.camera = bpy.context.object

    # Center origin around the mascot body so the web runtime scales cleanly.
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=False)


if __name__ == "__main__":
    make_corgi()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        export_apply=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )
    print(f"Exported {OUT}")
