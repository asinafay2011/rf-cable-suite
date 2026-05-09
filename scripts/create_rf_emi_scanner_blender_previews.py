from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
RENDERS_DIR = ROOT / "public" / "cable-renders"
MODELS_DIR = ROOT / "public" / "models"
BLEND_PATH = MODELS_DIR / "rf-emi-scanner-lab.blend"

LENGTH = 7.0

CASES = [
    {
        "id": "clean",
        "output": "rf-scanner-clean.png",
        "probe_x": -1.6,
        "leak": 0.14,
        "accent": (0.25, 0.95, 0.88),
        "fault": "clean",
    },
    {
        "id": "foil-seam",
        "output": "rf-scanner-foil-seam.png",
        "probe_x": -1.05,
        "leak": 0.95,
        "accent": (1.0, 0.50, 0.16),
        "fault": "foil",
    },
    {
        "id": "braid-window",
        "output": "rf-scanner-braid-window.png",
        "probe_x": 0.18,
        "leak": 0.74,
        "accent": (0.98, 0.76, 0.18),
        "fault": "braid",
    },
    {
        "id": "pigtail",
        "output": "rf-scanner-pigtail.png",
        "probe_x": 1.18,
        "leak": 0.86,
        "accent": (0.35, 0.83, 1.0),
        "fault": "pigtail",
    },
    {
        "id": "connector-bond",
        "output": "rf-scanner-connector-bond.png",
        "probe_x": 2.40,
        "leak": 1.0,
        "accent": (1.0, 0.30, 0.45),
        "fault": "connector",
    },
]


def ensure_dirs() -> None:
    RENDERS_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def set_render_settings() -> None:
    scene = bpy.context.scene
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 820
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
            ("bloom_intensity", 0.055),
        ):
            if hasattr(eevee, attr):
                setattr(eevee, attr, value)
    scene.world = bpy.data.worlds.new("RF_EMI_Scanner_World") if scene.world is None else scene.world
    scene.world.color = (0.008, 0.010, 0.012)


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
        if hasattr(mat, "use_screen_refraction"):
            mat.use_screen_refraction = True
    return mat


def make_materials(case: dict) -> dict[str, bpy.types.Material]:
    accent = case["accent"]
    return {
        "floor": make_material("floor_mat", (0.025, 0.031, 0.033, 1), roughness=0.62),
        "jacket": make_material("smoke_translucent_jacket", (0.025, 0.033, 0.035, 1), roughness=0.28, alpha=0.38),
        "dielectric": make_material("ptfe_dielectric", (0.82, 0.79, 0.66, 1), roughness=0.55, alpha=0.55),
        "conductor": make_material("copper_conductor", (0.95, 0.45, 0.18, 1), metallic=1, roughness=0.24),
        "foil": make_material("brushed_foil", (0.72, 0.76, 0.72, 1), metallic=1, roughness=0.22, alpha=0.32),
        "braid_a": make_material("tin_braid_a", (0.80, 0.73, 0.60, 1), metallic=1, roughness=0.31),
        "braid_b": make_material("warm_braid_b", (0.98, 0.55, 0.22, 1), metallic=1, roughness=0.27),
        "rail": make_material("scanner_rail", (0.55, 0.61, 0.62, 1), metallic=1, roughness=0.2),
        "probe": make_material("probe_dark", (0.065, 0.080, 0.085, 1), metallic=0.55, roughness=0.25),
        "probe_tip": make_material("probe_tip", (accent[0], accent[1], accent[2], 1), metallic=0.2, roughness=0.18, emission=accent, emission_strength=0.35),
        "field": make_material("hotspot_field", (accent[0], accent[1], accent[2], 1), roughness=0.12, alpha=0.72, emission=accent, emission_strength=1.8 + case["leak"] * 1.4),
        "field_soft": make_material("soft_field", (accent[0], accent[1], accent[2], 1), roughness=0.2, alpha=0.23, emission=accent, emission_strength=0.9),
        "warning": make_material("warning_fault", (1.0, 0.34, 0.14, 1), roughness=0.2, alpha=0.76, emission=(1.0, 0.30, 0.09), emission_strength=0.65),
        "cyan": make_material("cyan_low_field", (0.30, 0.96, 0.90, 1), roughness=0.2, alpha=0.44, emission=(0.30, 0.96, 0.90), emission_strength=0.75),
    }


def make_cylinder(
    name: str,
    radius: float,
    depth: float,
    material: bpy.types.Material,
    *,
    location: tuple[float, float, float] = (0, 0, 0),
    axis: str = "X",
    vertices: int = 96,
) -> bpy.types.Object:
    rotation = (0, math.radians(90), 0) if axis == "X" else (0, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
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
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    return obj


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


def make_braid(mats: dict[str, bpy.types.Material], *, fault: str, probe_x: float) -> None:
    carriers = 18
    turns = 5.3
    radius = 0.70
    points = 210
    gap_half = 0.36 if fault == "braid" else 0
    gap_start = (probe_x - gap_half + LENGTH / 2) / LENGTH
    gap_end = (probe_x + gap_half + LENGTH / 2) / LENGTH

    for carrier in range(carriers):
        for handedness, prefix in ((1, "RH"), (-1, "LH")):
            segments = [(0, 1)]
            if fault == "braid":
                segments = [(0, max(0, gap_start)), (min(1, gap_end), 1)]
            phase = math.tau * (carrier + (0.5 if handedness < 0 else 0)) / carriers
            for seg_index, (start_t, end_t) in enumerate(segments):
                if end_t - start_t < 0.02:
                    continue
                coords = []
                seg_points = max(18, int(points * (end_t - start_t)))
                for index in range(seg_points):
                    t = start_t + (end_t - start_t) * index / (seg_points - 1)
                    x = -LENGTH / 2 + LENGTH * t
                    theta = phase + handedness * turns * math.tau * t
                    coords.append((x, radius * math.cos(theta), radius * math.sin(theta)))
                mat = mats["braid_a"] if (carrier + (0 if handedness > 0 else 1)) % 2 else mats["braid_b"]
                make_curve(f"braid_{prefix}_{carrier:02d}_{seg_index}", coords, mat, 0.006, bevel_resolution=2)


def add_fault_marker(case: dict, mats: dict[str, bpy.types.Material]) -> None:
    x = case["probe_x"]
    fault = case["fault"]
    if fault == "clean":
        return
    if fault in {"foil", "braid"}:
        make_cube("shield_window_glow", (0.10, 0.58, 0.06), mats["warning"], location=(x, -0.52, 0.50))
        make_cube("shield_window_edge", (0.36, 0.05, 0.045), mats["warning"], location=(x, -0.58, 0.56))
    if fault == "pigtail":
        coords = [
            (x - 0.08, -0.42, 0.48),
            (x + 0.18, -0.90, 0.35),
            (x + 0.42, -1.18, 0.16),
            (x + 0.72, -1.42, 0.06),
        ]
        make_curve("long_pigtail_drain", coords, mats["braid_b"], 0.016, bevel_resolution=4)
        make_cube("pigtail_ground_lug", (0.18, 0.10, 0.035), mats["rail"], location=(x + 0.82, -1.48, 0.04))
    if fault == "connector":
        for offset, radius in ((0.0, 0.92), (0.22, 1.0), (0.47, 0.86)):
            make_cylinder(f"connector_shell_{offset:.1f}", radius, 0.22, mats["rail"], location=(2.92 + offset, 0, 0), axis="X", vertices=96)
        make_cube("connector_bond_gap", (0.045, 0.88, 0.08), mats["warning"], location=(x, -0.62, 0.62))


def add_probe(case: dict, mats: dict[str, bpy.types.Material]) -> None:
    x = case["probe_x"]
    make_cylinder("scanner_rail_front", 0.025, LENGTH + 0.4, mats["rail"], location=(0, -1.26, 1.70), axis="X", vertices=32)
    make_cylinder("scanner_rail_back", 0.018, LENGTH + 0.4, mats["rail"], location=(0, -0.62, 1.72), axis="X", vertices=32)
    make_cube("scanner_carriage", (0.22, 0.45, 0.075), mats["probe"], location=(x, -0.94, 1.68))
    make_cylinder("probe_wand", 0.025, 0.76, mats["probe"], location=(x, -0.94, 1.24), axis="Z", vertices=32)
    make_cylinder("probe_tip", 0.075, 0.12, mats["probe_tip"], location=(x, -0.94, 0.82), axis="Z", vertices=48)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.13, location=(x, -0.94, 0.78))
    tip = bpy.context.object
    tip.name = "probe_pickup_loop"
    tip.scale = (1.0, 0.36, 0.18)
    tip.data.materials.append(mats["probe_tip"])
    bpy.ops.object.shade_smooth()


def add_fields(case: dict, mats: dict[str, bpy.types.Material]) -> None:
    x = case["probe_x"]
    leak = case["leak"]
    color_mat = mats["field"] if leak > 0.4 else mats["cyan"]
    count = 4 + int(leak * 10)
    for line_index in range(count):
        phase = line_index * 0.73
        side = -1 if line_index % 2 else 1
        coords = []
        for sample in range(44):
            t = sample / 43
            bow = math.sin(t * math.pi)
            px = x + side * 0.42 * (line_index / max(count - 1, 1) - 0.5) + 0.035 * math.sin(t * math.tau + phase)
            y = -0.20 - 0.74 * t + 0.12 * bow * math.sin(phase)
            z = 0.52 + 0.28 * bow + 0.26 * t + 0.035 * math.sin(t * math.tau * 2 + phase)
            coords.append((px, y, z))
        make_curve(f"near_field_capture_{line_index:02d}", coords, color_mat, 0.005 + leak * 0.006, bevel_resolution=3)

    for ring_index in range(4):
        radius = 0.18 + ring_index * 0.11 * (0.55 + leak)
        bpy.ops.mesh.primitive_torus_add(
            major_radius=radius,
            minor_radius=0.0045 + leak * 0.003,
            major_segments=80,
            minor_segments=8,
            location=(x, -0.40, 0.56 + ring_index * 0.022),
            rotation=(math.radians(84), 0, 0),
        )
        ring = bpy.context.object
        ring.name = f"hotspot_ring_{ring_index}"
        ring.data.materials.append(color_mat)

    for tile_index in range(7):
        offset = (tile_index - 3) * 0.22
        intensity = max(0, leak - abs(offset) * 0.55)
        if intensity <= 0.04:
            continue
        tile_mat = mats["field_soft"] if intensity < 0.65 else mats["field"]
        make_cube(
            f"floor_heat_{tile_index}",
            (0.10 + intensity * 0.12, 0.34 + intensity * 0.18, 0.006),
            tile_mat,
            location=(x + offset, -0.60, -0.72),
        )


def build_scene(case: dict) -> None:
    reset_scene()
    set_render_settings()
    mats = make_materials(case)

    make_cube("matte_floor", (5.6, 2.45, 0.035), mats["floor"], location=(0, -0.10, -0.78))
    make_cylinder("center_conductor", 0.13, LENGTH, mats["conductor"], vertices=96)
    make_cylinder("ptfe_dielectric", 0.42, LENGTH, mats["dielectric"], vertices=96)
    make_cylinder("continuous_foil", 0.59, LENGTH, mats["foil"], vertices=128)
    make_braid(mats, fault=case["fault"], probe_x=case["probe_x"])
    make_cylinder("clear_outer_jacket", 0.84, LENGTH, mats["jacket"], vertices=128)
    add_fault_marker(case, mats)
    add_probe(case, mats)
    add_fields(case, mats)

    # Cable end faces make the construction legible without turning the scene into a cross-section.
    for x in (-LENGTH / 2, LENGTH / 2):
        make_cylinder(f"end_dielectric_{x}", 0.42, 0.035, mats["dielectric"], location=(x, 0, 0), axis="X", vertices=96)
        make_cylinder(f"end_conductor_{x}", 0.13, 0.045, mats["conductor"], location=(x, 0, 0), axis="X", vertices=64)

    bpy.ops.object.light_add(type="AREA", location=(-2.2, -3.0, 3.4))
    key = bpy.context.object
    key.name = "wide_softbox_key"
    key.data.energy = 530
    key.data.size = 4.4

    bpy.ops.object.light_add(type="POINT", location=(case["probe_x"], -1.55, 1.12))
    hot = bpy.context.object
    hot.name = "hotspot_probe_glow"
    hot.data.energy = 62 + case["leak"] * 130
    hot.data.color = case["accent"]

    bpy.ops.object.camera_add(location=(5.20, -6.10, 2.38), rotation=(math.radians(66), 0, math.radians(43)))
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    target = Vector((0.12, -0.26, 0.20))
    direction = target - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 42
    camera.data.dof.use_dof = True
    camera.data.dof.focus_object = bpy.data.objects.get("probe_pickup_loop")
    camera.data.dof.aperture_fstop = 6.0


def render_case(case: dict) -> None:
    build_scene(case)
    bpy.context.scene.render.filepath = str(RENDERS_DIR / case["output"])
    bpy.ops.render.render(write_still=True)


def main() -> None:
    ensure_dirs()
    for case in CASES:
        render_case(case)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(f"Saved RF EMI scanner previews to {RENDERS_DIR}")
    print(f"Saved Blender scene to {BLEND_PATH}")


if __name__ == "__main__":
    main()
