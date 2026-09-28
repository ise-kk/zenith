"""Build trains.json: Starlink satellites from launches in the last 30 days, with fresh orbits.

Inputs (downloaded by the workflow next to this script's working dir):
  sup.json    CelesTrak supplemental GP for Starlink (SpaceX-provided orbits, OMM/JSON)
  satcat.json CelesTrak SATCAT, GROUP=last-30-days (launch dates)
Output: trains.json  {"updated": ISO, "groups": [{"id": "2026-219", "date": "2026-09-20", "sats": [[name, l1, l2], ...]}]}

New objects have 6-digit catalogue numbers, which the classic two-line format cannot hold,
so the lines are written with the "Alpha-5" number (A0534 = 100534). Zenith decodes it.
"""
import json, sys, datetime as dt

MAX_AGE_DAYS = 3      # older orbits drift too far for a newly launched, still-rising satellite
MIN_MEMBERS = 5

def checksum(line):
    s = 0
    for c in line[:68]:
        if c.isdigit(): s += int(c)
        elif c == '-': s += 1
    return str(s % 10)

def alpha5(n):
    if n < 100000: return f"{n:05d}"
    letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"  # I and O are skipped
    return letters[n // 10000 - 10] + f"{n % 10000:04d}"

def expo(x):
    """TLE 'assumed decimal' exponent field, e.g. -0.000123 -> '-12300-3' (8 chars)."""
    if x == 0: return " 00000-0"
    sign = "-" if x < 0 else " "
    x = abs(x); e = 0
    while x >= 1: x /= 10; e += 1
    while x < 0.1: x *= 10; e -= 1
    m = round(x * 1e5)
    if m >= 100000: m //= 10; e += 1
    return f"{sign}{m:05d}{'-' if e < 0 else '+'}{abs(e)}"

def ndot(x):
    s = f"{abs(x):.8f}"[1:]  # '.00012345'
    return ("-" if x < 0 else " ") + s

def omm_to_tle(o):
    ep = dt.datetime.fromisoformat(o["EPOCH"]).replace(tzinfo=dt.timezone.utc)
    start = dt.datetime(ep.year, 1, 1, tzinfo=dt.timezone.utc)
    doy = (ep - start).total_seconds() / 86400 + 1
    intl = o["OBJECT_ID"]  # 2026-219A
    intl = intl[2:4] + intl[5:]
    num = alpha5(int(o["NORAD_CAT_ID"]))
    l1 = (f"1 {num}U {intl:<8} {ep.year % 100:02d}{doy:012.8f} {ndot(float(o.get('MEAN_MOTION_DOT', 0)))} "
          f"{expo(float(o.get('MEAN_MOTION_DDOT', 0)))} {expo(float(o.get('BSTAR', 0)))} 0 {int(o.get('ELEMENT_SET_NO', 999)) % 10000:4d}")
    ecc = f"{float(o['ECCENTRICITY']):.7f}"[2:]
    l2 = (f"2 {num} {float(o['INCLINATION']):8.4f} {float(o['RA_OF_ASC_NODE']):8.4f} {ecc} "
          f"{float(o['ARG_OF_PERICENTER']):8.4f} {float(o['MEAN_ANOMALY']):8.4f} {float(o['MEAN_MOTION']):11.8f}{int(o.get('REV_AT_EPOCH', 0)) % 100000:5d}")
    assert len(l1) == 68 and len(l2) == 68, (l1, l2)
    return l1 + checksum(l1), l2 + checksum(l2)

def main(now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    sup = json.load(open("sup.json"))
    cat = json.load(open("satcat.json"))
    launch = {}
    for r in cat:
        if str(r.get("OBJECT_NAME", "")).startswith("STARLINK"):
            launch[r["OBJECT_ID"][:8]] = r["LAUNCH_DATE"]
    groups = {}
    for o in sup:
        gid = o["OBJECT_ID"][:8]
        if gid not in launch: continue
        ep = dt.datetime.fromisoformat(o["EPOCH"]).replace(tzinfo=dt.timezone.utc)
        if (now - ep).total_seconds() > MAX_AGE_DAYS * 86400: continue
        l1, l2 = omm_to_tle(o)
        groups.setdefault(gid, []).append([o["OBJECT_NAME"], l1, l2])
    out = {"updated": now.strftime("%Y-%m-%dT%H:%MZ"),
           "groups": [{"id": g, "date": launch[g], "sats": s} for g, s in sorted(groups.items()) if len(s) >= MIN_MEMBERS]}
    json.dump(out, open("trains.json", "w"), separators=(",", ":"))
    print(f"{len(out['groups'])} launch group(s):", ", ".join(f"{g['id']} ({len(g['sats'])})" for g in out["groups"]))

if __name__ == "__main__":
    main()
