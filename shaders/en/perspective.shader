// Perspective (corner pin) for OBS Studio (obs-shaderfilter plugin, "User-defined shader" mode)
// Puts each corner of the image wherever you want, like Edit → Transform → Distort or
// Perspective in Photoshop. Corners are given in % of the source size: 0,0 is the top left
// and 100,100 the bottom right. They can be dragged with the mouse from obs-shader-dock.
//
// To let the image go past the source bounds, raise Expand left / right / top / bottom on the
// filter (or use the dock's expand button): half the width and height on each side fits the
// whole corner range, -50 to 150 %.
//
// Math: the homography H maps the unit square (u,v) to the four corners
// (Heckbert, "Fundamentals of Texture Mapping", 1989). For each output pixel p it computes
// uv = H⁻¹·p using the adjugate of H (no need to divide by the determinant: the final
// projective division cancels it). Outside the unit square the pixel is transparent.

uniform float tl_x<
    string label = "Top left X (%)";
    string widget_type = "slider";
    float minimum = -50.0; float maximum = 150.0; float step = 0.01;
> = 0.0;
uniform float tl_y<
    string label = "Top left Y (%)";
    string widget_type = "slider";
    float minimum = -50.0; float maximum = 150.0; float step = 0.01;
> = 0.0;
uniform float tr_x<
    string label = "Top right X (%)";
    string widget_type = "slider";
    float minimum = -50.0; float maximum = 150.0; float step = 0.01;
> = 100.0;
uniform float tr_y<
    string label = "Top right Y (%)";
    string widget_type = "slider";
    float minimum = -50.0; float maximum = 150.0; float step = 0.01;
> = 0.0;
uniform float br_x<
    string label = "Bottom right X (%)";
    string widget_type = "slider";
    float minimum = -50.0; float maximum = 150.0; float step = 0.01;
> = 100.0;
uniform float br_y<
    string label = "Bottom right Y (%)";
    string widget_type = "slider";
    float minimum = -50.0; float maximum = 150.0; float step = 0.01;
> = 100.0;
uniform float bl_x<
    string label = "Bottom left X (%)";
    string widget_type = "slider";
    float minimum = -50.0; float maximum = 150.0; float step = 0.01;
> = 0.0;
uniform float bl_y<
    string label = "Bottom left Y (%)";
    string widget_type = "slider";
    float minimum = -50.0; float maximum = 150.0; float step = 0.01;
> = 100.0;

uniform float edge_soft<
    string label = "Edge softness (px)";
    string widget_type = "slider";
    float minimum = 0.0; float maximum = 10.0; float step = 0.1;
> = 1.0;

float4 mainImage(VertData v_in) : TARGET
{
    float2 S = 1.0 / uv_pixel_interval;   // source size (uv_size grows with Expand)
    // Corners in pixels, in unit-square order: (0,0) (1,0) (1,1) (0,1)
    float2 p0 = float2(tl_x, tl_y) * 0.01 * S;
    float2 p1 = float2(tr_x, tr_y) * 0.01 * S;
    float2 p2 = float2(br_x, br_y) * 0.01 * S;
    float2 p3 = float2(bl_x, bl_y) * 0.01 * S;

    // Square → quad homography: x = (a u + b v + c) / (g u + h v + 1), same for y
    float2 s = p0 - p1 + p2 - p3;
    float2 d1 = p1 - p2;
    float2 d2 = p3 - p2;
    float den = d1.x * d2.y - d2.x * d1.y;
    float g = 0.0;
    float h = 0.0;
    if (abs(den) > 1e-6) {
        g = (s.x * d2.y - d2.x * s.y) / den;
        h = (d1.x * s.y - s.x * d1.y) / den;
    }
    float a = p1.x - p0.x + g * p1.x;
    float b = p3.x - p0.x + h * p3.x;
    float c = p0.x;
    float d = p1.y - p0.y + g * p1.y;
    float e = p3.y - p0.y + h * p3.y;
    float f = p0.y;

    // Inverse via the adjugate of [[a b c] [d e f] [g h 1]]
    float2 p = v_in.uv * S;               // with Expand, v_in.uv goes past 0..1 in the margin
    float qx = (e - f * h) * p.x + (c * h - b) * p.y + (b * f - c * e);
    float qy = (f * g - d) * p.x + (a - c * g) * p.y + (c * d - a * f);
    float qw = (d * h - e * g) * p.x + (b * g - a * h) * p.y + (a * e - b * d);
    if (abs(qw) < 1e-8)
        return float4(0.0, 0.0, 0.0, 0.0);
    float2 uv = float2(qx, qy) / qw;

    // Coverage: distance to the unit square edge, converted to screen pixels
    float2 fw = max(fwidth(uv), float2(1e-6, 1e-6));
    float2 inside = min(uv, 1.0 - uv) / fw;
    float cover = saturate(min(inside.x, inside.y) / max(edge_soft, 0.001) + 0.5);
    if (edge_soft <= 0.0)
        cover = (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) ? 1.0 : 0.0;
    if (cover <= 0.0)
        return float4(0.0, 0.0, 0.0, 0.0);

    float4 col = image.Sample(textureSampler, saturate(uv));
    col.a *= cover;
    return col;
}
