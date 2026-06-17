"""
hello.py — Python example script for bootstrapper-js
Open in the Python REPL via: double-click in Files, or type  python hello.py  in the terminal.
"""
import sys
import math
import json
from datetime import datetime

print("=" * 48)
print("  Hello from Python in the browser!")
print("=" * 48)
print(f"\nRuntime : Python {sys.version.split()[0]} (Pyodide)")
print(f"Time    : {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC")

# Fibonacci generator
def fibonacci():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b

fib = fibonacci()
first_12 = [next(fib) for _ in range(12)]
print(f"\nFibonacci : {first_12}")

# List comprehension + filter
primes = [n for n in range(2, 50) if all(n % d != 0 for d in range(2, int(n**0.5) + 1))]
print(f"Primes<50 : {primes}")

# Math
print(f"\nMath constants")
print(f"  pi    = {math.pi:.12f}")
print(f"  e     = {math.e:.12f}")
print(f"  tau   = {math.tau:.12f}")
print(f"  sqrt2 = {math.sqrt(2):.12f}")

# Dictionary / JSON round-trip
data = {"language": "Python", "runtime": "Pyodide", "browser": True, "answer": 42}
serialized = json.dumps(data, indent=2)
print(f"\nJSON round-trip:")
print(serialized)
restored = json.loads(serialized)
assert restored == data, "JSON round-trip failed"
print("  (round-trip verified)")

# Higher-order functions
words  = ["the", "quick", "brown", "fox", "jumps"]
upper  = list(map(str.upper, words))
long_w = list(filter(lambda w: len(w) > 3, words))
total  = sum(map(len, words))
print(f"\nWords    : {words}")
print(f"Upper    : {upper}")
print(f"Long     : {long_w}")
print(f"Total ch : {total}")

print("\nDone. Try the REPL below for interactive exploration!")
