# mini_torch — a tiny PyTorch-like autograd + neural-net library, pure
# Python + numpy (both run fine in Pyodide, unlike real PyTorch: its
# libtorch backend is C++/CUDA with no WebAssembly build, so `pip install
# torch` simply has no matching wheel inside a browser Python runtime).
#
# Mirrors PyTorch's own shapes/idioms deliberately, so anyone who knows
# PyTorch can read this directly:
#   - Tensor wraps a numpy array and builds a reverse-mode autodiff graph
#     as ops run; Tensor.backward() walks it and fills every Tensor's
#     .grad, the same "compute gradients automatically" step as
#     loss.backward() in real PyTorch.
#   - Module/BaseModel/Sequential/Linear/Conv2d/Conv3d/ReLU/Flatten mirror
#     torch.nn's Module/Sequential/Linear/Conv2d/Conv3d/ReLU/Flatten.
#   - SGD mirrors torch.optim.SGD - zero_grad()/step() work the same way.
#
# Edit this file directly (it's a plain vfs file, not vendored/minified) -
# it's loaded into a Notebook session via bridge.readFile + exec(), see
# the "Autograd — mini_torch" cells in a fresh Notebook.
#
# Scope/limits, on purpose (this is a teaching-scale toy, not a training
# framework): float64 only, CPU-only (numpy), no autocast/AMP, no
# broadcasting-aware conv/pooling beyond what's implemented below, and
# Conv2d/Conv3d use an im2col/vol2col + matmul formulation for correctness
# and reasonable numpy-vectorized speed at small (demo-scale) input sizes -
# not a competitively fast implementation.

import numpy as np


# ─── Autograd core ───────────────────────────────────────────────────────

def _unbroadcast(grad, shape):
    """Sum-reduce `grad` down to `shape`, undoing numpy broadcasting -
    needed whenever an op (e.g. adding a (C,) bias to a (N,C,H,W) tensor)
    ran on operands of different shapes, since the incoming upstream
    gradient has the *broadcast* (output) shape, not each operand's own."""
    while grad.ndim > len(shape):
        grad = grad.sum(axis=0)
    for i, dim in enumerate(shape):
        if dim == 1 and grad.shape[i] != 1:
            grad = grad.sum(axis=i, keepdims=True)
    return grad


class Tensor:
    """A numpy array plus a reverse-mode autodiff graph. Every op that
    takes/returns a Tensor records its inputs (`_prev`) and a `_backward`
    closure computing local gradients; `.backward()` topologically sorts
    the graph from the output and runs each closure in reverse, exactly
    the "tape" PyTorch builds implicitly during the forward pass."""

    def __init__(self, data, requires_grad=False, _children=(), _op=''):
        self.data = np.asarray(data, dtype=np.float64)
        self.requires_grad = requires_grad
        self.grad = np.zeros_like(self.data) if requires_grad else None
        self._backward = lambda: None
        self._prev = set(_children)
        self._op = _op

    def __repr__(self):
        return f"Tensor(shape={self.data.shape}, requires_grad={self.requires_grad})"

    @property
    def shape(self):
        return self.data.shape

    @property
    def T(self):
        out = Tensor(self.data.T, requires_grad=self.requires_grad, _children=(self,), _op='T')
        def _backward():
            if self.requires_grad:
                self.grad = self.grad + out.grad.T
        out._backward = _backward
        return out

    def zero_grad(self):
        if self.requires_grad:
            self.grad = np.zeros_like(self.data)

    def backward(self):
        assert self.data.size == 1, "backward() only implemented for scalar outputs (call .sum()/.mean() first)"
        topo, visited = [], set()

        def build(v):
            if id(v) not in visited:
                visited.add(id(v))
                for child in v._prev:
                    build(child)
                topo.append(v)

        build(self)
        self.grad = np.ones_like(self.data)
        for v in reversed(topo):
            v._backward()

    # ---- elementwise / linear-algebra ops ----

    def _other(self, other):
        return other if isinstance(other, Tensor) else Tensor(other)

    def __add__(self, other):
        other = self._other(other)
        out = Tensor(self.data + other.data, requires_grad=self.requires_grad or other.requires_grad,
                     _children=(self, other), _op='+')
        def _backward():
            if self.requires_grad:
                self.grad = self.grad + _unbroadcast(out.grad, self.data.shape)
            if other.requires_grad:
                other.grad = other.grad + _unbroadcast(out.grad, other.data.shape)
        out._backward = _backward
        return out
    __radd__ = __add__

    def __neg__(self):
        out = Tensor(-self.data, requires_grad=self.requires_grad, _children=(self,), _op='neg')
        def _backward():
            if self.requires_grad:
                self.grad = self.grad - out.grad
        out._backward = _backward
        return out

    def __sub__(self, other):
        return self + (-self._other(other))

    def __rsub__(self, other):
        return self._other(other) + (-self)

    def __mul__(self, other):
        other = self._other(other)
        out = Tensor(self.data * other.data, requires_grad=self.requires_grad or other.requires_grad,
                     _children=(self, other), _op='*')
        def _backward():
            if self.requires_grad:
                self.grad = self.grad + _unbroadcast(out.grad * other.data, self.data.shape)
            if other.requires_grad:
                other.grad = other.grad + _unbroadcast(out.grad * self.data, other.data.shape)
        out._backward = _backward
        return out
    __rmul__ = __mul__

    def __truediv__(self, other):
        other = self._other(other)
        return self * (other ** -1)

    def __pow__(self, power):
        assert isinstance(power, (int, float)), "Tensor ** Tensor is not supported, only Tensor ** number"
        out = Tensor(self.data ** power, requires_grad=self.requires_grad, _children=(self,), _op=f'**{power}')
        def _backward():
            if self.requires_grad:
                self.grad = self.grad + (power * self.data ** (power - 1)) * out.grad
        out._backward = _backward
        return out

    def __matmul__(self, other):
        other = self._other(other)
        out = Tensor(self.data @ other.data, requires_grad=self.requires_grad or other.requires_grad,
                     _children=(self, other), _op='matmul')
        def _backward():
            if self.requires_grad:
                self.grad = self.grad + out.grad @ other.data.T
            if other.requires_grad:
                other.grad = other.grad + self.data.T @ out.grad
        out._backward = _backward
        return out

    # ---- shape / reduction ops ----

    def sum(self):
        out = Tensor(self.data.sum(), requires_grad=self.requires_grad, _children=(self,), _op='sum')
        def _backward():
            if self.requires_grad:
                self.grad = self.grad + np.ones_like(self.data) * out.grad
        out._backward = _backward
        return out

    def mean(self):
        out = Tensor(self.data.mean(), requires_grad=self.requires_grad, _children=(self,), _op='mean')
        def _backward():
            if self.requires_grad:
                self.grad = self.grad + np.ones_like(self.data) * out.grad / self.data.size
        out._backward = _backward
        return out

    def reshape(self, *shape):
        if len(shape) == 1 and isinstance(shape[0], (tuple, list)):
            shape = tuple(shape[0])
        out = Tensor(self.data.reshape(shape), requires_grad=self.requires_grad, _children=(self,), _op='reshape')
        def _backward():
            if self.requires_grad:
                self.grad = self.grad + out.grad.reshape(self.data.shape)
        out._backward = _backward
        return out

    def relu(self):
        out = Tensor(np.maximum(0, self.data), requires_grad=self.requires_grad, _children=(self,), _op='relu')
        def _backward():
            if self.requires_grad:
                self.grad = self.grad + (self.data > 0) * out.grad
        out._backward = _backward
        return out

    def sigmoid(self):
        s = 1.0 / (1.0 + np.exp(-self.data))
        out = Tensor(s, requires_grad=self.requires_grad, _children=(self,), _op='sigmoid')
        def _backward():
            if self.requires_grad:
                self.grad = self.grad + (s * (1 - s)) * out.grad
        out._backward = _backward
        return out


def tensor(data, requires_grad=False):
    return Tensor(data, requires_grad=requires_grad)


# ─── im2col / col2im (2D) and vol2col / col2vol (3D) ────────────────────
# Standard "unroll receptive fields into columns, convolve via one matmul"
# formulation - the shift-and-slice loops below only ever iterate over
# kernel positions (small: e.g. 3x3 or 3x3x3), never over batch/channel/
# spatial size, so the actual per-position work stays fully numpy-
# vectorized. col2im's "+=" is the standard scatter-add that undoes the
# overlapping reads im2col performed - it's the exact gradient of im2col's
# gather, not a separate approximation.

def _im2col_2d(x, kh, kw, stride, padding):
    N, C, H, W = x.shape
    x_p = np.pad(x, ((0, 0), (0, 0), (padding, padding), (padding, padding)))
    Hp, Wp = x_p.shape[2], x_p.shape[3]
    out_h = (Hp - kh) // stride + 1
    out_w = (Wp - kw) // stride + 1
    cols = np.zeros((N, C, kh, kw, out_h, out_w))
    for i in range(kh):
        i_max = i + stride * out_h
        for j in range(kw):
            j_max = j + stride * out_w
            cols[:, :, i, j, :, :] = x_p[:, :, i:i_max:stride, j:j_max:stride]
    cols = cols.transpose(0, 4, 5, 1, 2, 3).reshape(N * out_h * out_w, -1)
    return cols, out_h, out_w


def _col2im_2d(cols, x_shape, kh, kw, stride, padding):
    N, C, H, W = x_shape
    Hp, Wp = H + 2 * padding, W + 2 * padding
    out_h = (Hp - kh) // stride + 1
    out_w = (Wp - kw) // stride + 1
    cols_r = cols.reshape(N, out_h, out_w, C, kh, kw).transpose(0, 3, 4, 5, 1, 2)
    x_p = np.zeros((N, C, Hp, Wp))
    for i in range(kh):
        i_max = i + stride * out_h
        for j in range(kw):
            j_max = j + stride * out_w
            x_p[:, :, i:i_max:stride, j:j_max:stride] += cols_r[:, :, i, j, :, :]
    return x_p if padding == 0 else x_p[:, :, padding:-padding, padding:-padding]


def _im2col_3d(x, kd, kh, kw, stride, padding):
    N, C, D, H, W = x.shape
    x_p = np.pad(x, ((0, 0), (0, 0), (padding, padding), (padding, padding), (padding, padding)))
    Dp, Hp, Wp = x_p.shape[2], x_p.shape[3], x_p.shape[4]
    out_d = (Dp - kd) // stride + 1
    out_h = (Hp - kh) // stride + 1
    out_w = (Wp - kw) // stride + 1
    cols = np.zeros((N, C, kd, kh, kw, out_d, out_h, out_w))
    for di in range(kd):
        d_max = di + stride * out_d
        for i in range(kh):
            i_max = i + stride * out_h
            for j in range(kw):
                j_max = j + stride * out_w
                cols[:, :, di, i, j, :, :, :] = x_p[:, :, di:d_max:stride, i:i_max:stride, j:j_max:stride]
    cols = cols.transpose(0, 5, 6, 7, 1, 2, 3, 4).reshape(N * out_d * out_h * out_w, -1)
    return cols, out_d, out_h, out_w


def _col2im_3d(cols, x_shape, kd, kh, kw, stride, padding):
    N, C, D, H, W = x_shape
    Dp, Hp, Wp = D + 2 * padding, H + 2 * padding, W + 2 * padding
    out_d = (Dp - kd) // stride + 1
    out_h = (Hp - kh) // stride + 1
    out_w = (Wp - kw) // stride + 1
    cols_r = cols.reshape(N, out_d, out_h, out_w, C, kd, kh, kw).transpose(0, 4, 5, 6, 7, 1, 2, 3)
    x_p = np.zeros((N, C, Dp, Hp, Wp))
    for di in range(kd):
        d_max = di + stride * out_d
        for i in range(kh):
            i_max = i + stride * out_h
            for j in range(kw):
                j_max = j + stride * out_w
                x_p[:, :, di:d_max:stride, i:i_max:stride, j:j_max:stride] += cols_r[:, :, di, i, j, :, :, :]
    return x_p if padding == 0 else x_p[:, :, padding:-padding, padding:-padding, padding:-padding]


def conv2d(x: Tensor, weight: Tensor, bias, stride=1, padding=0):
    """x: (N,C,H,W), weight: (out_c,C,kh,kw), bias: Tensor(out_c,) or None."""
    kh, kw = weight.data.shape[2], weight.data.shape[3]
    cols, out_h, out_w = _im2col_2d(x.data, kh, kw, stride, padding)
    out_c = weight.data.shape[0]
    w_col = weight.data.reshape(out_c, -1)
    out = cols @ w_col.T
    if bias is not None:
        out = out + bias.data
    N = x.data.shape[0]
    out = out.reshape(N, out_h, out_w, out_c).transpose(0, 3, 1, 2)

    children = (x, weight) + ((bias,) if bias is not None else ())
    requires_grad = x.requires_grad or weight.requires_grad or (bias is not None and bias.requires_grad)
    result = Tensor(out, requires_grad=requires_grad, _children=children, _op='conv2d')

    def _backward():
        grad_out_col = result.grad.transpose(0, 2, 3, 1).reshape(-1, out_c)
        if weight.requires_grad:
            weight.grad = weight.grad + (grad_out_col.T @ cols).reshape(weight.data.shape)
        if bias is not None and bias.requires_grad:
            bias.grad = bias.grad + grad_out_col.sum(axis=0)
        if x.requires_grad:
            dcols = grad_out_col @ w_col
            x.grad = x.grad + _col2im_2d(dcols, x.data.shape, kh, kw, stride, padding)
    result._backward = _backward
    return result


def conv3d(x: Tensor, weight: Tensor, bias, stride=1, padding=0):
    """x: (N,C,D,H,W), weight: (out_c,C,kd,kh,kw), bias: Tensor(out_c,) or None."""
    kd, kh, kw = weight.data.shape[2], weight.data.shape[3], weight.data.shape[4]
    cols, out_d, out_h, out_w = _im2col_3d(x.data, kd, kh, kw, stride, padding)
    out_c = weight.data.shape[0]
    w_col = weight.data.reshape(out_c, -1)
    out = cols @ w_col.T
    if bias is not None:
        out = out + bias.data
    N = x.data.shape[0]
    out = out.reshape(N, out_d, out_h, out_w, out_c).transpose(0, 4, 1, 2, 3)

    children = (x, weight) + ((bias,) if bias is not None else ())
    requires_grad = x.requires_grad or weight.requires_grad or (bias is not None and bias.requires_grad)
    result = Tensor(out, requires_grad=requires_grad, _children=children, _op='conv3d')

    def _backward():
        grad_out_col = result.grad.transpose(0, 2, 3, 4, 1).reshape(-1, out_c)
        if weight.requires_grad:
            weight.grad = weight.grad + (grad_out_col.T @ cols).reshape(weight.data.shape)
        if bias is not None and bias.requires_grad:
            bias.grad = bias.grad + grad_out_col.sum(axis=0)
        if x.requires_grad:
            dcols = grad_out_col @ w_col
            x.grad = x.grad + _col2im_3d(dcols, x.data.shape, kd, kh, kw, stride, padding)
    result._backward = _backward
    return result


# ─── nn.Module-style layers ──────────────────────────────────────────────

class Module:
    """Base class for anything with learnable Tensors - mirrors
    torch.nn.Module. Subclass, assign layers/parameters as attributes in
    __init__, define forward(); parameters() walks attributes (including
    nested Modules and lists of them) to collect every trainable Tensor,
    the same way real PyTorch's .parameters() does."""

    def parameters(self):
        params = []
        for v in self.__dict__.values():
            params.extend(_collect_params(v))
        return params

    def zero_grad(self):
        for p in self.parameters():
            p.zero_grad()

    def __call__(self, *args, **kwargs):
        return self.forward(*args, **kwargs)

    def forward(self, *args, **kwargs):
        raise NotImplementedError


def _collect_params(v):
    if isinstance(v, Tensor):
        return [v] if v.requires_grad else []
    if isinstance(v, Module):
        return v.parameters()
    if isinstance(v, (list, tuple)):
        out = []
        for item in v:
            out.extend(_collect_params(item))
        return out
    return []


class BaseModel(Module):
    """Identical to Module - named the way a PyTorch user would expect a
    model base class to be called: `class MyModel(BaseModel):` reads the
    same as `class MyModel(nn.Module):`."""
    pass


class Linear(Module):
    """y = x @ W.T + b, same convention as torch.nn.Linear."""

    def __init__(self, in_features, out_features, bias=True):
        limit = np.sqrt(1.0 / in_features)
        self.weight = Tensor(np.random.uniform(-limit, limit, (out_features, in_features)), requires_grad=True)
        self.bias = Tensor(np.zeros(out_features), requires_grad=True) if bias else None

    def forward(self, x: Tensor) -> Tensor:
        out = x @ self.weight.T
        return out + self.bias if self.bias is not None else out


class Conv2d(Module):
    def __init__(self, in_channels, out_channels, kernel_size, stride=1, padding=0, bias=True):
        kh, kw = (kernel_size, kernel_size) if isinstance(kernel_size, int) else kernel_size
        fan_in = in_channels * kh * kw
        limit = np.sqrt(1.0 / fan_in)
        self.weight = Tensor(np.random.uniform(-limit, limit, (out_channels, in_channels, kh, kw)), requires_grad=True)
        self.bias = Tensor(np.zeros(out_channels), requires_grad=True) if bias else None
        self.stride, self.padding = stride, padding

    def forward(self, x: Tensor) -> Tensor:
        return conv2d(x, self.weight, self.bias, self.stride, self.padding)


class Conv3d(Module):
    def __init__(self, in_channels, out_channels, kernel_size, stride=1, padding=0, bias=True):
        kd, kh, kw = (kernel_size,) * 3 if isinstance(kernel_size, int) else kernel_size
        fan_in = in_channels * kd * kh * kw
        limit = np.sqrt(1.0 / fan_in)
        self.weight = Tensor(np.random.uniform(-limit, limit, (out_channels, in_channels, kd, kh, kw)), requires_grad=True)
        self.bias = Tensor(np.zeros(out_channels), requires_grad=True) if bias else None
        self.stride, self.padding = stride, padding

    def forward(self, x: Tensor) -> Tensor:
        return conv3d(x, self.weight, self.bias, self.stride, self.padding)


class ReLU(Module):
    def forward(self, x: Tensor) -> Tensor:
        return x.relu()


class Sigmoid(Module):
    def forward(self, x: Tensor) -> Tensor:
        return x.sigmoid()


class Flatten(Module):
    def forward(self, x: Tensor) -> Tensor:
        return x.reshape(x.shape[0], -1)


class Sequential(Module):
    """Chains layers in order, like torch.nn.Sequential:
    Sequential(Conv2d(...), ReLU(), Flatten(), Linear(...))."""

    def __init__(self, *layers):
        self.layers = list(layers)

    def forward(self, x: Tensor) -> Tensor:
        for layer in self.layers:
            x = layer(x)
        return x


# ─── Losses + optimizer ──────────────────────────────────────────────────

def mse_loss(pred: Tensor, target) -> Tensor:
    target = target if isinstance(target, Tensor) else Tensor(target)
    diff = pred - target
    return (diff * diff).mean()


class SGD:
    """Mirrors torch.optim.SGD: zero_grad() then, after loss.backward(),
    step() applies grad * lr (with optional momentum) to every parameter."""

    def __init__(self, parameters, lr=0.01, momentum=0.0):
        self.parameters = list(parameters)
        self.lr = lr
        self.momentum = momentum
        self._velocity = [np.zeros_like(p.data) for p in self.parameters] if momentum else None

    def zero_grad(self):
        for p in self.parameters:
            p.zero_grad()

    def step(self):
        for i, p in enumerate(self.parameters):
            if self.momentum:
                self._velocity[i] = self.momentum * self._velocity[i] + p.grad
                p.data = p.data - self.lr * self._velocity[i]
            else:
                p.data = p.data - self.lr * p.grad
