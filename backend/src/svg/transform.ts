/** SVG transform lists as 2×3 matrices [a, b, c, d, e, f] (x' = a·x + c·y + e, y' = b·x + d·y + f). */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export const apply = (m: Matrix, [x, y]: [number, number]): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** A transform attribute ("translate(10 20) rotate(30 256 256)") as one matrix; undefined if it can't be read. */
export function parseTransform(value: string | undefined): Matrix | undefined {
  if (value === undefined || !value.trim()) return IDENTITY;
  let matrix = IDENTITY;
  const pattern = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)\s*,?/gy;
  let consumed = 0;
  for (let match = pattern.exec(value); match; match = pattern.exec(value)) {
    consumed = pattern.lastIndex;
    const n = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (n.some(Number.isNaN)) return undefined;
    let step: Matrix;
    switch (match[1]) {
      case 'matrix':
        if (n.length !== 6) return undefined;
        step = n as Matrix;
        break;
      case 'translate':
        step = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
        break;
      case 'scale':
        step = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const [angle = 0, cx = 0, cy = 0] = n;
        const [cos, sin] = [Math.cos(rad(angle)), Math.sin(rad(angle))];
        step = multiply(multiply([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewX':
        step = [1, 0, Math.tan(rad(n[0] ?? 0)), 1, 0, 0];
        break;
      default:
        step = [1, Math.tan(rad(n[0] ?? 0)), 0, 1, 0, 0];
    }
    matrix = multiply(matrix, step);
  }
  return value.slice(consumed).trim() ? undefined : matrix;
}
