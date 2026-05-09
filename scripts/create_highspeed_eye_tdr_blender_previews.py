from __future__ import annotations

import math
from pathlib import Path

import bpy
import mathutils
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
RENDERS_DIR = ROOT / "public" / "cable-renders"
MODELS_DIR = ROOT / "public" / "models"
BLEND_PATH = MODELS_DIR / "highspeed-eye-tdr-correlation.blend"

LENGTH = 6.8

CASES = [
    {
        "id": "nominal",
        "output": "hs-eye-tdr-nominal.png",
        "accent": (0.34, 0.96, 0.86),
        "fault": "nominal",
        "defect_x": -1.25,
        "tone": "golden pair",
    },
    {
        "id": "skew",
        "output": "hs-eye-tdr-skew.png",
        "accent": (0.46, 0.83, 1.0),
        "fault": "skew",
        "defect_x": -0.85,
        "tone": "late conductor",
    },
    {
        "id": "impedance",
        "output": "hs-eye-tdr-impedance.png",
        "accent": (1.0, 0.72, 0.14),
        "fault": "impedance",
        "defect_x": 0.05,
        "tone": "dielectric step",
    },
    {
        "id": "foil-gap",
        "output": "hs-eye-tdr-foil-gap.png",
        "accent": (1.0, 0.48, 0.16),
        "fault": "foil-gap",
        "defect_x": 0.92,
        "tone": "shield leak",
    },
    {
        "id": "bad-twist",
        "output": "hs-eye-tdr-bad-twist.png",
        "accent": (0.96, 0.45, 0.78),
        "fault": "bad-twist",
        "defect_x": -0.12,
        "tone": "lay wander",
    },
]


def ensure_dirs() -> None:
    RENDERS_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for datablock in (bpy.data.curves, bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for item in list(datablock):
            if item.users == 0:
                datablock.remove(item)


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 780
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
            ("gtao_distance", 3.2),
            ("gtao_factor", 1.55),
            ("use_bloom", True),
            ("bloom_intensity", 0.07),
        ):
            if hasattr(eevee, attr):
                setattr(eevee, attr, value)
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = -0.1
    scene.world = scene.world or bpy.data.worlds.new("Highspeed_Eye_TDR_World")
    scene.world.color = (0.010, 0.012, 0.014)


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.45,
    alpha: float = 1.0,
    emission: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
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


def make_materials(case: dict) -> dict[str, bpy.types.Material]:
    accent = case["accent"]
    return {
        "floor": make_material("dark_analyzer_floor", (0.022, 0.026, 0.027, 1), roughness=0.72),
        "jacket": make_material("smoke_clear_jacket", (0.038, 0.050, 0.054, 1), roughness=0.28, alpha=0.24),
        "ptfe": make_material("translucent_ptfe_wrap", (0.86, 0.84, 0.72, 1), roughness=0.5, alpha=0.34),
        "foil": make_material("brushed_foil_wrap", (0.74, 0.80, 0.80, 1), metallic=0.65, roughness=0.23, alpha=0.48),
        "foil_edge": make_material("foil_cut_edge", (1.0, 0.58, 0.18, 1), metallic=0.2, roughness=0.28, alpha=0.62, emission=(1.0, 0.34, 0.07), emission_strength=0.55),
        "blue": make_material("blue_pair_insulation", (0.28, 0.62, 1.0, 1), roughness=0.38),
        "white": make_material("white_pair_insulation", (0.92, 0.94, 0.90, 1), roughness=0.38),
        "copper": make_material("copper_exposed_ends", (0.94, 0.44, 0.16, 1), metallic=0.72, roughness=0.22),
        "accent": make_material("defect_accent", (accent[0], accent[1], accent[2], 1), roughness=0.2, alpha=0.72, emission=accent, emission_strength=1.45),
        "accent_soft": make_material("defect_accent_soft", (accent[0], accent[1], accent[2], 1), roughness=0.52, alpha=0.26, emission=accent, emission_strength=0.82),
        "amber_soft": make_material("amber_measurement_glow", (1.0, 0.62, 0.16, 1), roughness=0.45, alpha=0.30, emission=(1.0, 0.40, 0.08), emission_strength=0.75),
        "cyan_soft": make_material("cyan_signal_glow", (0.26, 0.92, 0.84, 1), roughness=0.45, alpha=0.30, emission=(0.20, 0.92, 0.82), emission_strength=0.75),
        "clamp": make_material("transparent_process_clamp", (1.0, 0.22, 0.08, 1), roughness=0.25, alpha=0.28, emission=(1.0, 0.18, 0.06), emission_strength=0.24),
        "dark": make_material("analyzer_dark", (0.030, 0.036, 0.038, 1), roughness=0.56),
    }


def make_curve(
    name: str,
    coords: list[tuple[float, float, float]],
    material: bpy.types.Material,
    bevel_depth: float,
    *,
    bevel_resolution: int = 3,
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


def make_cylinder(
    name: str,
    radius: float,
    depth: float,
    material: bpy.types.Material,
    *,
    location: tuple[float, float, float] = (0, 0, 0),
    vertices: int = 128,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, rotation=(0, math.pi / 2, 0), location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return obj


def make_cube(
    name: str,
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    location: tuple[float, float, float],
    rotation: tuple[float, float, float] = (0, 0, 0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    return obj


def gaussian(x: float, center: float, width: float) -> float:
    return math.exp(-0.5 * ((x - center) / max(width, 0.001)) ** 2)


def pair_path(case: dict, side: int, *, conductor: bool = False, samples: int = 430) -> list[tuple[float, float, float]]:
    fault = case["fault"]
    defect_x = case["defect_x"]
    coords = []
    base_turns = 10.4
    base_pair_radius = 0.145
    for index in range(samples + 1):
        t = index / samples
        x = -LENGTH / 2 + LENGTH * t
        local = gaussian(x, defect_x, 0.68)
        theta = base_turns * math.tau * t
        center_y = 0.020 * math.sin(t * math.tau * 1.2)
        center_z = 0.020 * math.cos(t * math.tau * 0.9)
        pair_radius = base_pair_radius

        if fault == "bad-twist":
            theta += 1.1 * local * math.sin(t * math.tau * 7.4)
            pair_radius *= 1 + 0.30 * local * math.sin(t * math.tau * 5.0)
        if fault == "skew" and side > 0:
            x += 0.11 * local * math.sin(t * math.tau * 2.2)
            center_z += 0.055 * local
        if fault == "impedance":
            center_z -= 0.050 * local
            pair_radius *= 1 - 0.18 * local

        radius = pair_radius * (0.82 if conductor else 1.0)
        y = center_y + side * radius * math.cos(theta)
        z = center_z + side * radius * math.sin(theta)
        coords.append((x, y, z))
    return coords


def add_wire_end_tips(paths: list[list[tuple[float, float, float]]], mats: dict[str, bpy.types.Material]) -> None:
    for path in paths:
        for co in (path[0], path[-1]):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.035, location=co)
            tip = bpy.context.object
            tip.name = "exposed_copper_tip"
            tip.scale.x = 1.35
            tip.data.materials.append(mats["copper"])


def make_spiral_strip(
    name: str,
    radius: float,
    width: float,
    turns: float,
    material: bpy.types.Material,
    *,
    phase: float = 0,
    skip_center: float | None = None,
    skip_width: float = 0.0,
    samples: int = 260,
) -> None:
    segments: list[list[tuple[float, float, float]]] = []
    active: list[tuple[float, float, float]] = []
    for index in range(samples + 1):
        t = index / samples
        x = -LENGTH / 2 + LENGTH * t
        if skip_center is not None and abs(x - skip_center) < skip_width / 2:
            if len(active) > 1:
                segments.append(active)
            active = []
            continue
        theta = phase + turns * math.tau * t
        active.append((x, radius * math.cos(theta), radius * math.sin(theta)))
    if len(active) > 1:
        segments.append(active)

    for seg_index, centers in enumerate(segments):
        verts: list[tuple[float, float, float]] = []
        faces: list[list[int]] = []
        for x, y, z in centers:
            verts.append((x - width / 2, y, z))
            verts.append((x + width / 2, y, z))
        for index in range(len(centers) - 1):
            a = index * 2
            faces.append([a, a + 2, a + 3, a + 1])
        mesh = bpy.data.meshes.new(f"{name}_{seg_index}_mesh")
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(f"{name}_{seg_index}", mesh)
        obj.data.materials.append(material)
        bpy.context.collection.objects.link(obj)
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.shade_smooth()
        obj.select_set(False)


def add_signal_trace(case: dict, mats: dict[str, bpy.types.Material]) -> None:
    accent = mats["accent"] if case["fault"] != "nominal" else mats["cyan_soft"]
    pts = []
    for index in range(170):
        t = index / 169
        x = -LENGTH / 2 + LENGTH * t
        y = -0.62
        z = 0.66 + 0.035 * math.sin(t * math.tau * 4)
        pts.append((x, y, z))
    make_curve("measurement_signal_trace", pts, accent, 0.012, bevel_resolution=4)

    pulse_x = case["defect_x"]
    for offset, scale, material in ((0, 1.0, mats["accent"]), (0.32 if case["fault"] == "skew" else 0.0, 0.58, mats["accent_soft"])):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.085 * scale, location=(pulse_x + offset, -0.62, 0.66))
        pulse = bpy.context.object
        pulse.name = "measurement_pulse"
        pulse.scale.x = 1.8
        pulse.data.materials.append(material)


def add_foil_flap(case: dict, mats: dict[str, bpy.types.Material]) -> None:
    x = case["defect_x"]
    verts = [
        (x - 0.40, -0.36, 0.28),
        (x + 0.34, -0.36, 0.30),
        (x + 0.58, -0.80, 0.56),
        (x - 0.18, -0.76, 0.54),
    ]
    mesh = bpy.data.meshes.new("foil_gap_flap_mesh")
    mesh.from_pydata(verts, [], [[0, 1, 2, 3]])
    mesh.update()
    obj = bpy.data.objects.new("peeled_foil_gap_flap", mesh)
    obj.data.materials.append(mats["foil_edge"])
    bpy.context.collection.objects.link(obj)


def add_leak_rays(case: dict, mats: dict[str, bpy.types.Material]) -> None:
    x = case["defect_x"]
    for ray in range(10):
        angle = -0.55 + ray * 0.13
        pts = []
        for step in range(38):
            t = step / 37
            pts.append((
                x + 0.14 * math.sin(t * math.pi + ray * 0.7),
                -0.36 - t * (0.32 + ray * 0.018),
                0.30 + t * (0.58 + 0.15 * math.cos(angle)),
            ))
        make_curve(f"foil_leak_field_{ray:02d}", pts, mats["accent_soft"], 0.006 + ray * 0.0008, bevel_resolution=3)


def add_bad_twist_highlight(case: dict, mats: dict[str, bpy.types.Material]) -> None:
    x0 = case["defect_x"]
    for band in range(5):
        x = x0 - 0.62 + band * 0.30
        bpy.ops.mesh.primitive_torus_add(
            major_radius=0.40 + 0.02 * math.sin(band),
            minor_radius=0.006,
            major_segments=96,
            minor_segments=8,
            location=(x, 0, 0),
            rotation=(0, math.pi / 2, 0),
        )
        obj = bpy.context.object
        obj.name = "lay_wander_phase_ring"
        obj.data.materials.append(mats["accent"])


def add_impedance_bump(case: dict, mats: dict[str, bpy.types.Material]) -> None:
    x = case["defect_x"]
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.465,
        minor_radius=0.030,
        major_segments=128,
        minor_segments=12,
        location=(x, 0, 0),
        rotation=(0, math.pi / 2, 0),
    )
    ring = bpy.context.object
    ring.name = "impedance_bump_tdr_ring"
    ring.scale.x = 1.2
    ring.data.materials.append(mats["accent"])
    make_cube("soft_crush_upper_plate", (0.48, 0.74, 0.025), mats["clamp"], location=(x, 0, 0.56), rotation=(0, 0, math.radians(3)))
    make_cube("soft_crush_lower_shadow", (0.48, 0.74, 0.018), mats["clamp"], location=(x, 0, -0.54), rotation=(0, 0, math.radians(-2)))


def add_skew_markers(case: dict, mats: dict[str, bpy.types.Material]) -> None:
    x = case["defect_x"]
    for offset, mat in ((-0.15, mats["cyan_soft"]), (0.32, mats["accent"])):
        pts = []
        for step in range(36):
            t = step / 35
            pts.append((x + offset + 0.02 * math.sin(t * math.tau), 0.42, -0.10 + t * 0.46))
        make_curve(f"skew_delay_marker_{offset}", pts, mat, 0.010, bevel_resolution=3)


def add_defect_art(case: dict, mats: dict[str, bpy.types.Material]) -> None:
    fault = case["fault"]
    if fault == "foil-gap":
        add_foil_flap(case, mats)
        add_leak_rays(case, mats)
    elif fault == "impedance":
        add_impedance_bump(case, mats)
    elif fault == "bad-twist":
        add_bad_twist_highlight(case, mats)
    elif fault == "skew":
        add_skew_markers(case, mats)
    else:
        bpy.ops.mesh.primitive_torus_add(
            major_radius=0.43,
            minor_radius=0.008,
            major_segments=128,
            minor_segments=8,
            location=(case["defect_x"], 0, 0),
            rotation=(0, math.pi / 2, 0),
        )
        obj = bpy.context.object
        obj.name = "golden_reference_ring"
        obj.data.materials.append(mats["cyan_soft"])
    add_signal_trace(case, mats)


def add_floor(mats: dict[str, bpy.types.Material]) -> None:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.78))
    floor = bpy.context.object
    floor.name = "charcoal_measurement_floor"
    floor.dimensions = (8.4, 3.6, 0.045)
    floor.data.materials.append(mats["floor"])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def add_lighting(case: dict) -> None:
    accent = case["accent"]
    bpy.ops.object.light_add(type="AREA", location=(-3.0, -4.3, 3.4))
    key = bpy.context.object
    key.name = "large_softbox"
    key.data.energy = 720
    key.data.size = 4.8

    bpy.ops.object.light_add(type="AREA", location=(3.1, 2.7, 2.2))
    rim = bpy.context.object
    rim.name = "colored_defect_rim"
    rim.data.energy = 160
    rim.data.size = 2.5
    rim.data.color = accent


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_camera() -> None:
    bpy.ops.object.camera_add(location=(4.9, -5.1, 2.25))
    camera = bpy.context.object
    camera.name = "Highspeed_Eye_TDR_Camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 3.65
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = 6.2
    camera.data.dof.aperture_fstop = 7.5
    look_at(camera, Vector((0, 0, 0.05)))
    bpy.context.scene.camera = camera


def build_case(case: dict) -> None:
    mats = make_materials(case)
    add_floor(mats)

    make_cylinder("transparent_outer_jacket", 0.56, LENGTH + 0.16, mats["jacket"])
    make_spiral_strip("ptfe_spiral_wrap", 0.335, 0.205, 8.2, mats["ptfe"], phase=math.radians(18))
    make_spiral_strip(
        "foil_spiral_wrap",
        0.425,
        0.225,
        7.4,
        mats["foil"],
        phase=math.radians(144),
        skip_center=case["defect_x"] if case["fault"] == "foil-gap" else None,
        skip_width=0.76,
    )

    wire_paths = []
    for side, mat_key in ((1, "blue"), (-1, "white")):
        path = pair_path(case, side)
        wire_paths.append(path)
        make_curve(f"{mat_key}_insulated_conductor", path, mats[mat_key], 0.052, bevel_resolution=5)
        make_curve(f"{mat_key}_copper_core_hint", pair_path(case, side, conductor=True), mats["copper"], 0.014, bevel_resolution=3)
    add_wire_end_tips(wire_paths, mats)
    add_defect_art(case, mats)
    add_lighting(case)
    add_camera()


def render_case(case: dict, *, save_blend: bool = False) -> None:
    clear_scene()
    configure_scene()
    build_case(case)
    bpy.context.scene.render.filepath = str(RENDERS_DIR / case["output"])
    bpy.ops.render.render(write_still=True)
    if save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
        backup_path = Path(str(BLEND_PATH) + "1")
        if backup_path.exists():
            backup_path.unlink()


def main() -> None:
    ensure_dirs()
    for index, case in enumerate(CASES):
        render_case(case, save_blend=index == len(CASES) - 1)


if __name__ == "__main__":
    main()
