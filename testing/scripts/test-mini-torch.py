#!/usr/bin/env python3
"""
Correctness check for docs/public/mount/usr/lib/py/mini_torch.py, run with
plain CPython + numpy (not Pyodide) since the library itself has no
browser dependency - only the Notebook example that loads it does.

Verifies every differentiable op (including conv2d/conv3d, the trickiest
part - im2col/col2im-based backward passes) against numerical (finite-
difference) gradients, then runs a full Sequential/BaseModel training
loop end-to-end and asserts the loss actually decreases - a strong
practical signal on top of the analytic checks that nothing is
transposed/mis-summed in a way that happens to cancel out in isolation.
"""
import sys
import os
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..',
                                 'docs', 'public', 'mount', 'usr', 'lib', 'py'))
import mini_torch as mt

np.random.seed(0)
PASS = []
FAIL = []


def check(name, cond, detail=''):
    if cond:
        PASS.append(name)
        print(f'  PASS  {name}')
    else:
        FAIL.append(name)
        print(f'  FAIL  {name}  {detail}')


def numeric_grad(f, x, eps=1e-5):
    """f: numpy array -> scalar. Central-difference gradient wrt every
    element of x."""
    grad = np.zeros_like(x)
    it = np.nditer(x, flags=['multi_index'])
    while not it.finished:
        idx = it.multi_index
        orig = x[idx]
        x[idx] = orig + eps
        f_plus = f(x)
        x[idx] = orig - eps
        f_minus = f(x)
        x[idx] = orig
        grad[idx] = (f_plus - f_minus) / (2 * eps)
        it.iternext()
    return grad


def grad_check(name, build_fn, param_shapes, rtol=2e-3, atol=1e-4):
    """build_fn(*param_arrays) -> scalar loss (python float), using
    mini_torch ops on Tensors wrapping the given numpy arrays. Compares
    mini_torch's analytic .grad against a finite-difference estimate for
    every parameter."""
    arrays = [np.random.randn(*shape) * 0.5 for shape in param_shapes]

    def analytic():
        tensors = [mt.Tensor(a.copy(), requires_grad=True) for a in arrays]
        loss = build_fn(*tensors)
        loss.backward()
        return [t.grad.copy() for t in tensors]

    ag = analytic()
    ok = True
    for i, a in enumerate(arrays):
        def f(_, i=i):
            tensors = [mt.Tensor(arr.copy(), requires_grad=True) for arr in arrays]
            return float(build_fn(*tensors).data)
        ng = numeric_grad(f, a)
        close = np.allclose(ag[i], ng, rtol=rtol, atol=atol)
        if not close:
            ok = False
            print(f'    param {i}: max abs diff = {np.abs(ag[i]-ng).max():.6f}')
    check(name, ok)


print('=== Gradient checks (analytic vs finite-difference) ===')

grad_check('add + mul + pow', lambda a, b: ((a + b) * (a - b) ** 2).sum(), [(3,), (3,)])
grad_check('matmul', lambda a, b: (a @ b).sum(), [(3, 4), (4, 2)])
grad_check('relu', lambda a: (a.relu() * 2).sum(), [(5,)])
grad_check('sigmoid', lambda a: a.sigmoid().sum(), [(4,)])
grad_check('reshape', lambda a: a.reshape(2, 3).sum(), [(6,)])
grad_check('mean', lambda a: a.mean() * a.mean(), [(4, 4)])
grad_check('broadcast add (bias)', lambda a, b: (a + b).sum(), [(2, 3), (3,)])

grad_check(
    'conv2d (no padding)',
    lambda x, w, b: mt.conv2d(x, w, b, stride=1, padding=0).sum(),
    [(2, 2, 5, 5), (3, 2, 3, 3), (3,)],
)
grad_check(
    'conv2d (padding=1, stride=2)',
    lambda x, w, b: mt.conv2d(x, w, b, stride=2, padding=1).sum(),
    [(1, 1, 6, 6), (2, 1, 3, 3), (2,)],
)
grad_check(
    'conv3d (no padding)',
    lambda x, w, b: mt.conv3d(x, w, b, stride=1, padding=0).sum(),
    [(1, 1, 4, 4, 4), (2, 1, 2, 2, 2), (2,)],
)

print()
print('=== End-to-end training: BaseModel + Sequential + Conv2d + Linear + SGD ===')


class TinyCNN(mt.BaseModel):
    def __init__(self):
        self.features = mt.Sequential(
            mt.Conv2d(1, 4, kernel_size=3, padding=1),
            mt.ReLU(),
            mt.Flatten(),
        )
        self.head = mt.Linear(4 * 8 * 8, 1)

    def forward(self, x):
        return self.head(self.features(x)).sigmoid()


# Synthetic task: classify whether the mean pixel value of an 8x8 "image"
# is above 0 (a trivially learnable but non-degenerate signal for a tiny
# conv+linear model).
N = 32
X = np.random.randn(N, 1, 8, 8)
y = (X.mean(axis=(1, 2, 3), keepdims=False) > 0).astype(np.float64).reshape(N, 1)

model = TinyCNN()
opt = mt.SGD(model.parameters(), lr=0.5)

x_t = mt.Tensor(X)
y_t = mt.Tensor(y)

losses = []
for epoch in range(60):
    opt.zero_grad()
    pred = model(x_t)
    loss = mt.mse_loss(pred, y_t)
    loss.backward()
    opt.step()
    losses.append(float(loss.data))

print(f'  loss[0]  = {losses[0]:.4f}')
print(f'  loss[-1] = {losses[-1]:.4f}')
check('training loss decreases substantially', losses[-1] < losses[0] * 0.5,
      f'{losses[0]:.4f} -> {losses[-1]:.4f}')

final_pred = (model(x_t).data > 0.5).astype(np.float64)
accuracy = (final_pred == y).mean()
print(f'  final training accuracy = {accuracy:.2f}')
check('learns a usable classifier (accuracy > 0.85)', accuracy > 0.85, f'accuracy={accuracy:.2f}')

print()
print('=== Conv3d shape/gradient smoke check ===')
conv3d_layer = mt.Conv3d(1, 2, kernel_size=3, padding=1)
vol = mt.Tensor(np.random.randn(1, 1, 6, 6, 6), requires_grad=False)
out = conv3d_layer(vol)
check('conv3d output shape', out.shape == (1, 2, 6, 6, 6), f'got {out.shape}')
out.sum().backward()
check('conv3d weight grad populated', not np.allclose(conv3d_layer.weight.grad, 0))
check('conv3d bias grad populated', not np.allclose(conv3d_layer.bias.grad, 0))

print()
print(f'=== {len(PASS)} passed, {len(FAIL)} failed ===')
if FAIL:
    print('FAILED:', FAIL)
    sys.exit(1)
