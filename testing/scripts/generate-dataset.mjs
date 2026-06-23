// Generate a simple sample dataset of 32x32 PNG images with metadata
// for the diffusion model pipeline in NN-IDE.

import { createCanvas } from 'canvas'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT = '/Users/pankajdevesh/Desktop/Gitea-Workspaces/bootstrapper-js'
const OUT = join(ROOT, 'docs/public/mount/home/user1/projects/diffusion-dataset')
const SIZE = 32

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

// We'll generate simple geometric shapes as PNG data URIs,
// then write them as raw PNG files using pure JS (no canvas dependency needed).

// Actually, let's just create the metadata and simple binary PNGs.
// For a browser-based app, we'll generate the images IN the browser at first use.
// But we need sample files on disk for the VFS.

// Simple approach: write a metadata JSON + placeholder script that generates images on load.

const samples = [
  { file: 'red_circle.json',    prompt: 'a red circle on white background',     shape: 'circle',    color: [255, 50, 50] },
  { file: 'blue_square.json',   prompt: 'a blue square on white background',    shape: 'square',    color: [50, 50, 255] },
  { file: 'green_triangle.json',prompt: 'a green triangle on white background', shape: 'triangle',  color: [50, 200, 50] },
  { file: 'yellow_circle.json', prompt: 'a yellow circle on black background',  shape: 'circle',    color: [255, 255, 50], bg: [0, 0, 0] },
  { file: 'purple_square.json', prompt: 'a purple square on gray background',   shape: 'square',    color: [150, 50, 200], bg: [128, 128, 128] },
  { file: 'orange_triangle.json',prompt:'an orange triangle on dark background', shape: 'triangle', color: [255, 150, 50], bg: [30, 30, 30] },
  { file: 'white_circle.json',  prompt: 'a white circle on blue background',    shape: 'circle',    color: [255, 255, 255], bg: [40, 40, 180] },
  { file: 'cyan_square.json',   prompt: 'a cyan square on dark background',     shape: 'square',    color: [50, 230, 230], bg: [20, 20, 40] },
]

const metadata = {
  name: 'Simple Shapes',
  description: 'Sample dataset of 32x32 geometric shapes for diffusion model training',
  size: SIZE,
  channels: 3,
  samples: samples.map(s => ({
    prompt: s.prompt,
    shape: s.shape,
    color: s.color,
    bg: s.bg || [255, 255, 255],
  })),
}

writeFileSync(join(OUT, 'dataset.json'), JSON.stringify(metadata, null, 2))
console.log(`Wrote dataset.json with ${samples.length} sample definitions`)
console.log('Images will be generated at runtime by the NN-IDE diffusion pipeline')
console.log('Dataset path: /home/user1/projects/diffusion-dataset/')
