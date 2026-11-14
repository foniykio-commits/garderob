"""Parametric body measurements shared with the 3D fitting room.

Segment lengths follow stature fractions used in biomechanics
(Drillis and Contini). Girths are anchored to a 175 cm, 70 kg body
and then scaled with height and BMI so a taller or heavier person
changes proportion, not just a uniform scale.
"""

REF_BMI = 22.86

GIRTHS = {
    "neck": (0.214, 0.35),
    "chest": (0.549, 0.50),
    "waist": (0.469, 0.90),
    "hips": (0.549, 0.55),
    "thigh": (0.309, 0.70),
    "calf": (0.206, 0.40),
    "bicep": (0.183, 0.65),
    "wrist": (0.094, 0.25),
    "ankle": (0.126, 0.30),
}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def body_metrics(height_cm: float, weight_kg: float) -> dict:
    height = _clamp(float(height_cm), 140.0, 220.0)
    weight = _clamp(float(weight_kg), 35.0, 180.0)
    meters = height / 100.0
    bmi = weight / (meters * meters)
    ratio = bmi / REF_BMI
    girths = {}
    for name, (per_cm, exponent) in GIRTHS.items():
        girths[name] = round(per_cm * height * ratio**exponent, 1)
    lean, mid, heavy = 16.0, 23.0, 34.0
    clamped = _clamp(bmi, lean, heavy)
    if clamped <= mid:
        morph = [(clamped - lean) / (mid - lean), 0.0]
    else:
        step = (clamped - mid) / (heavy - mid)
        morph = [1.0 - step, step]
    return {
        "height_cm": round(height, 1),
        "weight_kg": round(weight, 1),
        "bmi": round(bmi, 2),
        "morph": [round(morph[0], 3), round(morph[1], 3)],
        "segments_cm": {
            "head": round(0.130 * height, 1),
            "neck": round(0.052 * height, 1),
            "shoulder_height": round(0.818 * height, 1),
            "chest_height": round(0.735 * height, 1),
            "waist_height": round(0.60 * height, 1),
            "crotch_height": round(0.47 * height, 1),
            "knee_height": round(0.285 * height, 1),
            "upper_arm": round(0.186 * height, 1),
            "forearm": round(0.146 * height, 1),
        },
        "girths_cm": girths,
    }
