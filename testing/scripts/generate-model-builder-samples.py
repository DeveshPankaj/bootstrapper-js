"""
Generates the sample dataset CSVs bundled with the Model Builder app
(docs/public/mount/opt/apps/model-builder/sample-datasets/). These are
static reference files only — nothing in the app auto-loads or parses
them; a user opens Model Builder, clicks "Upload Dataset...", and picks
one of these files themselves (after downloading/copying it out of the
vfs, since the upload flow uses a native OS file picker, which can't see
into the app's own virtual filesystem directly).

Re-run this script (`python3 testing/scripts/generate-model-builder-samples.py`)
any time the sample datasets need regenerating.
"""
import csv
import base64
import io
import random
import os
import urllib.request
from PIL import Image, ImageDraw

random.seed(20260921)

OUT_DIR = os.path.join(
    os.path.dirname(__file__), '..', '..',
    'docs', 'public', 'mount', 'opt', 'apps', 'model-builder', 'sample-datasets'
)
os.makedirs(OUT_DIR, exist_ok=True)


def png_data_uri(img):
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    return f'data:image/png;base64,{b64}'


# ---------------------------------------------------------------------------
# 1. classification.csv — plain numeric-feature binary classification.
#    Two features + a text class label, points inside vs. outside a circle
#    (same shape of task as the built-in "circle" example) — 2 input columns,
#    1 output column, meant to exercise the 2D decision-surface plot.
# ---------------------------------------------------------------------------
def make_classification_csv():
    path = os.path.join(OUT_DIR, 'classification.csv')
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['x1', 'x2', 'label'])
        for _ in range(200):
            x1 = random.uniform(-1, 1)
            x2 = random.uniform(-1, 1)
            label = 'inside' if (x1 * x1 + x2 * x2) < 0.36 else 'outside'
            w.writerow([round(x1, 4), round(x2, 4), label])
    print('wrote', path)


# ---------------------------------------------------------------------------
# 2. image-classification.csv — base64 (data-URI) PNG images + a class label.
#    Two shape classes ("circle" / "square") drawn at random positions/sizes
#    on a 16x16 canvas, real (if synthetic) images end to end.
# ---------------------------------------------------------------------------
def make_shape_image(kind, size=16):
    img = Image.new('L', (size, size), color=0)
    draw = ImageDraw.Draw(img)
    margin = random.randint(1, 3)
    box = [margin, margin, size - 1 - margin, size - 1 - margin]
    if kind == 'circle':
        draw.ellipse(box, fill=255)
    elif kind == 'square':
        draw.rectangle(box, fill=255)
    elif kind == 'triangle':
        x0, y0, x1, y1 = box
        draw.polygon([(x0, y1), ((x0 + x1) / 2, y0), (x1, y1)], fill=255)
    elif kind == 'cross':
        x0, y0, x1, y1 = box
        w = max(2, (x1 - x0) // 4)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        draw.rectangle([cx - w / 2, y0, cx + w / 2, y1], fill=255)
        draw.rectangle([x0, cy - w / 2, x1, cy + w / 2], fill=255)
    return img


def make_image_classification_csv():
    path = os.path.join(OUT_DIR, 'image-classification.csv')
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['image', 'label'])
        for i in range(60):
            kind = 'circle' if i % 2 == 0 else 'square'
            img = make_shape_image(kind)
            w.writerow([png_data_uri(img), kind])
    print('wrote', path)


# ---------------------------------------------------------------------------
# 2b. image-classification-4class.csv — same idea, but 4 shape classes
#     (circle / square / triangle / cross), for exercising >2-class
#     classification with image input (confusion-matrix branch, not the
#     2-class decision-surface plot).
# ---------------------------------------------------------------------------
def make_image_classification_4class_csv():
    path = os.path.join(OUT_DIR, 'image-classification-4class.csv')
    kinds = ['circle', 'square', 'triangle', 'cross']
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['image', 'label'])
        for i in range(80):
            kind = kinds[i % len(kinds)]
            img = make_shape_image(kind)
            w.writerow([png_data_uri(img), kind])
    print('wrote', path)


# ---------------------------------------------------------------------------
# 2c. classification-4class.csv — plain numeric-feature classification with
#     4 classes (which quadrant of the plane a point falls in). 2 input
#     columns like classification.csv above, but >2 output classes, so it
#     exercises the confusion-matrix branch instead of the 2-class decision-
#     surface plot (drawPlot()'s plot2D only ever applies to exactly 2
#     classes).
# ---------------------------------------------------------------------------
def make_classification_4class_csv():
    path = os.path.join(OUT_DIR, 'classification-4class.csv')
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['x1', 'x2', 'quadrant'])
        for _ in range(240):
            x1 = random.uniform(-1, 1)
            x2 = random.uniform(-1, 1)
            if x1 >= 0 and x2 >= 0:
                label = 'top-right'
            elif x1 < 0 and x2 >= 0:
                label = 'top-left'
            elif x1 < 0 and x2 < 0:
                label = 'bottom-left'
            else:
                label = 'bottom-right'
            w.writerow([round(x1, 4), round(x2, 4), label])
    print('wrote', path)


# ---------------------------------------------------------------------------
# 3. image-segmentation.csv — an input image (a circle on a noisy background)
#    and its target segmentation mask (white circle silhouette on black) —
#    trained as image input -> image output (pixel regression against the
#    mask), the same honest approximation of segmentation the app's
#    image-output pathway supports (see model-builder/main.html's own
#    comment on isImageOutput: real regression against pixel targets, not a
#    convolutional decoder).
# ---------------------------------------------------------------------------
def make_segmentation_pair(size=16):
    cx = random.randint(5, size - 6)
    cy = random.randint(5, size - 6)
    r = random.randint(3, 5)

    input_img = Image.new('L', (size, size), color=0)
    din = ImageDraw.Draw(input_img)
    # background clutter noise so the input isn't trivially identical to the mask
    for _ in range(12):
        nx, ny = random.randint(0, size - 1), random.randint(0, size - 1)
        din.point((nx, ny), fill=random.randint(40, 100))
    din.ellipse([cx - r, cy - r, cx + r, cy + r], fill=220)

    mask_img = Image.new('L', (size, size), color=0)
    dmask = ImageDraw.Draw(mask_img)
    dmask.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)

    return input_img, mask_img


def make_image_segmentation_csv():
    path = os.path.join(OUT_DIR, 'image-segmentation.csv')
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['image', 'mask'])
        for _ in range(60):
            input_img, mask_img = make_segmentation_pair()
            w.writerow([png_data_uri(input_img), png_data_uri(mask_img)])
    print('wrote', path)


# ---------------------------------------------------------------------------
# Real, downloaded (not synthetic) tabular classification datasets — public,
# well-known, freely-redistributable ML benchmarks, fetched once here and
# committed as static CSVs. Two real 3-class datasets and one real 4-class
# dataset, covering both numeric-feature and categorical/text-feature inputs.
# ---------------------------------------------------------------------------
def fetch_text(url):
    with urllib.request.urlopen(url, timeout=15) as resp:
        return resp.read().decode('utf-8')


# 4. iris-real.csv — the actual, classic 150-row Fisher's Iris dataset
#    (3 species, 4 numeric measurements) — public domain, ubiquitous in ML.
#    Complements the app's built-in "iris" task, which is explicitly a
#    synthetic approximation (see main.html's own comment on it), not the
#    real 150-row dataset.
def make_iris_real_csv():
    url = 'https://gist.githubusercontent.com/curran/a08a1080b88344b0c8a7/raw/0e7a9b0a5d22642a06d3d5b9bcbad9890c8ee534/iris.csv'
    text = fetch_text(url)
    path = os.path.join(OUT_DIR, 'iris-real.csv')
    with open(path, 'w', newline='') as f:
        f.write(text)
    print('wrote', path, '(downloaded from', url, ')')


# 5. penguins.csv — the real Palmer Penguins dataset (CC0), 3 species
#    (Adelie/Chinstrap/Gentoo), numeric bill/flipper/mass measurements.
#    Rows with missing (NA) measurements are dropped.
def make_penguins_csv():
    url = 'https://raw.githubusercontent.com/allisonhorst/palmerpenguins/main/inst/extdata/penguins.csv'
    text = fetch_text(url)
    reader = csv.DictReader(io.StringIO(text))
    rows = [r for r in reader if 'NA' not in r.values()]
    path = os.path.join(OUT_DIR, 'penguins.csv')
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g', 'species'])
        for r in rows:
            w.writerow([r['bill_length_mm'], r['bill_depth_mm'], r['flipper_length_mm'], r['body_mass_g'], r['species']])
    print('wrote', path, '(downloaded from', url, ', ', len(rows), 'complete rows)')


# 5b. penguins-3d.csv — the same real Palmer Penguins measurements as
#     penguins.csv above, but exactly 3 of its 4 numeric columns
#     (body_mass_g dropped) — a real dataset with exactly 3 input
#     dimensions, for exercising the app's interactive 3D scatter plot
#     without needing PCA dimensionality reduction first.
def make_penguins_3d_csv():
    url = 'https://raw.githubusercontent.com/allisonhorst/palmerpenguins/main/inst/extdata/penguins.csv'
    text = fetch_text(url)
    reader = csv.DictReader(io.StringIO(text))
    rows = [r for r in reader if 'NA' not in r.values()]
    path = os.path.join(OUT_DIR, 'penguins-3d.csv')
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'species'])
        for r in rows:
            w.writerow([r['bill_length_mm'], r['bill_depth_mm'], r['flipper_length_mm'], r['species']])
    print('wrote', path, '(downloaded from', url, ', ', len(rows), 'complete rows, 3 of 4 real numeric columns)')


# 6. car-evaluation.csv — the real UCI Car Evaluation dataset, 4 classes
#    (unacc / acc / good / vgood) from 6 CATEGORICAL features — unlike the
#    other numeric examples here, this exercises the app's "text" input
#    type (bag-of-words over each category name) on real, categorical,
#    non-numeric data. The full dataset is 1728 rows and badly imbalanced
#    (1210 unacc vs. 65 vgood) — downsampled to at most 60/class here so
#    training stays interactive in this app's per-sample (no batching, no
#    GPU) JS backprop loop, same reasoning as the MNIST/Fashion-MNIST
#    subsets already bundled with this app.
def make_car_evaluation_csv():
    url = 'https://archive.ics.uci.edu/ml/machine-learning-databases/car/car.data'
    text = fetch_text(url)
    header = ['buying', 'maint', 'doors', 'persons', 'lug_boot', 'safety', 'acceptability']
    rows = [line.split(',') for line in text.strip().splitlines()]
    by_class = {}
    for r in rows:
        by_class.setdefault(r[-1], []).append(r)
    per_class_cap = 60
    sampled = []
    for cls, cls_rows in by_class.items():
        random.shuffle(cls_rows)
        sampled.extend(cls_rows[:per_class_cap])
    random.shuffle(sampled)
    path = os.path.join(OUT_DIR, 'car-evaluation.csv')
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(sampled)
    print('wrote', path, '(downloaded from', url, ', downsampled to', len(sampled), f'of {len(rows)} rows, <= {per_class_cap}/class)')


if __name__ == '__main__':
    make_classification_csv()
    make_classification_4class_csv()
    make_image_classification_csv()
    make_image_classification_4class_csv()
    make_image_segmentation_csv()
    try:
        make_iris_real_csv()
        make_penguins_csv()
        make_penguins_3d_csv()
        make_car_evaluation_csv()
    except Exception as e:
        print('WARNING: could not fetch one or more real datasets (no network access?):', e)
