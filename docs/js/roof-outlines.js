import { site } from "./site-config.js?v=20261002";
// MapLibre 4 custom 3D layer. Draw boundaries at the actual roof elevation;
// shared depth testing hides edges behind nearer stacks instead of drawing through them.
export function roofOutlines(data, getView) {
  return {
    id: "roof-edges",
    type: "custom",
    renderingMode: "3d",
    onAdd(map, gl) {
      this.map = map;
      const shader = (type, source) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const vertex = shader(
        gl.VERTEX_SHADER,
        "precision highp float; uniform mat4 matrix; attribute vec3 position; void main(){gl_Position=matrix*vec4(position,1.0);}",
      );
      const fragment = shader(
        gl.FRAGMENT_SHADER,
        "precision mediump float; uniform float opacity; void main(){gl_FragColor=vec4(0.68,0.74,0.69,opacity);}",
      );
      this.program = gl.createProgram();
      gl.attachShader(this.program, vertex);
      gl.attachShader(this.program, fragment);
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(this.program));
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      this.position = gl.getAttribLocation(this.program, "position");
      this.matrix = gl.getUniformLocation(this.program, "matrix");
      this.opacityUniform = gl.getUniformLocation(this.program, "opacity");
      this.buffer = gl.createBuffer();
      this.cache = new Map();
      // Keep GPU coordinates close to zero. Subtracting large world coordinates
      // in a float shader loses precision as the camera zooms in.
      this.origin = maplibregl.MercatorCoordinate.fromLngLat(site.roofOrigin);
      this.localMatrix = new Float32Array(16);
      this.opacity = 0.34;
      this.lastFrame = performance.now();
      this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    },
    render(gl, matrix) {
      const { field, flat, scale } = getView();
      const key = `${field}:${flat}`;
      if (this.key !== key) {
        if (!this.cache.has(key)) {
          const vertices = [];
          for (const feature of data.features) {
            const height = flat
              ? 0
              : Math.max(0, feature.properties[field] || 0) * scale;
            const polygons =
              feature.geometry.type === "Polygon"
                ? [feature.geometry.coordinates]
                : feature.geometry.coordinates;
            for (const polygon of polygons)
              for (const ring of polygon)
                for (let i = 1; i < ring.length; i++) {
                  for (const coord of [ring[i - 1], ring[i]]) {
                    const p = maplibregl.MercatorCoordinate.fromLngLat(
                      coord,
                      height + 8,
                    );
                    vertices.push(
                      p.x - this.origin.x,
                      p.y - this.origin.y,
                      p.z,
                    );
                  }
                }
          }
          this.cache.set(key, new Float32Array(vertices));
        }
        const vertices = this.cache.get(key);
        this.count = vertices.length / 3;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        this.key = key;
      }
      // Compose the translation in JavaScript's double precision, before the
      // GPU receives the matrix. Depth testing and actual roof heights stay intact.
      this.localMatrix.set(matrix);
      for (let row = 0; row < 4; row++) {
        this.localMatrix[12 + row] =
          matrix[row] * this.origin.x +
          matrix[4 + row] * this.origin.y +
          matrix[12 + row];
      }
      const now = performance.now();
      const elapsed = Math.min(64, now - this.lastFrame);
      this.lastFrame = now;
      const target = this.map.isZooming() ? 0.14 : 0.34;
      this.opacity = this.reducedMotion.matches
        ? target
        : this.opacity +
          (target - this.opacity) * (1 - Math.exp(-elapsed / 110));
      if (Math.abs(target - this.opacity) > 0.002) this.map.triggerRepaint();
      gl.useProgram(this.program);
      gl.uniformMatrix4fv(this.matrix, false, this.localMatrix);
      gl.uniform1f(this.opacityUniform, this.opacity);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.enableVertexAttribArray(this.position);
      gl.vertexAttribPointer(this.position, 3, gl.FLOAT, false, 0, 0);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.lineWidth(1);
      gl.drawArrays(gl.LINES, 0, this.count);
      gl.disableVertexAttribArray(this.position);
    },
    onRemove(map, gl) {
      gl.deleteBuffer(this.buffer);
      gl.deleteProgram(this.program);
      this.cache.clear();
    },
  };
}
