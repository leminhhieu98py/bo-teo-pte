import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cropPlan, MIN_AREA_PX } from '../lib/capture.js';

test('cropPlan ignores areas smaller than the minimum', () => {
  assert.equal(MIN_AREA_PX, 20);
  assert.equal(cropPlan({ x: 0, y: 0, width: 19, height: 200 }, 1000, 2000, 1200), null);
  assert.equal(cropPlan({ x: 0, y: 0, width: 200, height: 10 }, 1000, 2000, 1200), null);
});

test('cropPlan converts page pixels to screenshot pixels', () => {
  assert.deepEqual(cropPlan({ x: 10, y: 20, width: 300, height: 200 }, 1000, 2000, 1200), {
    sx: 20, sy: 40, sw: 600, sh: 400, dw: 600, dh: 400,
  });
});

test('cropPlan clamps the area to the screenshot', () => {
  const plan = cropPlan({ x: 900, y: 500, width: 300, height: 300 }, 1000, 2000, 1200);
  assert.deepEqual(plan, { sx: 1800, sy: 1000, sw: 200, sh: 200, dw: 200, dh: 200 });
});

test('cropPlan scales big areas down to the max side', () => {
  const plan = cropPlan({ x: 0, y: 0, width: 1000, height: 500 }, 1000, 2000, 1200, 1600);
  assert.equal(plan.sw, 2000);
  assert.equal(plan.sh, 1000);
  assert.equal(plan.dw, 1600);
  assert.equal(plan.dh, 800);
});
