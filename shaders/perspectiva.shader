// Perspectiva (corner pin) para OBS Studio (plugin obs-shaderfilter, modo "User-defined shader")
// Pone cada esquina de la imagen donde quieras, como Edición → Transformar → Distorsionar o
// Perspectiva en Photoshop. Las esquinas se dan en % del tamaño de la fuente: 0,0 es arriba a la
// izquierda y 100,100 abajo a la derecha. Se pueden mover con el mouse desde obs-shader-dock.
//
// Matemática: la homografía H lleva el cuadrado unitario (u,v) a las cuatro esquinas
// (Heckbert, "Fundamentals of Texture Mapping", 1989). Para cada pixel de salida p se calcula
// uv = H⁻¹·p con la adjunta de H (no hace falta dividir entre el determinante: la división
// proyectiva final lo cancela). Fuera del cuadrado unitario el pixel queda transparente.

uniform float tl_x<
    string label = "Arriba izquierda X (%)";
    string widget_type = "slider";
    float minimum = -50.0; float maximum = 150.0; float step = 0.01;
> = 0.0;
uniform float tl_y<
    string label = "Arriba izquierda Y (%)";
    string widget_type = "slider";
    float minimum = -50.0; float maximum = 150.0; float step = 0.01;
> = 0.0;
uniform float tr_x<
    string label = "Arriba derecha X (%)";
    string widget_type = "slider";
    float minimum = -50.0; float maximum = 150.0; float step = 0.01;
> = 100.0;
uniform float tr_y<
    string label = "Arriba derecha Y (%)";
    string widget_type = "slider";
    float minimum = -50.0; float maximum = 150.0; float step = 0.01;
> = 0.0;
uniform float br_x<
    string label = "Abajo derecha X (%)";
    string widget_type = "slider";
    float minimum = -50.0; float maximum = 150.0; float step = 0.01;
> = 100.0;
uniform float br_y<
    string label = "Abajo derecha Y (%)";
    string widget_type = "slider";
    float minimum = -50.0; float maximum = 150.0; float step = 0.01;
> = 100.0;
uniform float bl_x<
    string label = "Abajo izquierda X (%)";
    string widget_type = "slider";
    float minimum = -50.0; float maximum = 150.0; float step = 0.01;
> = 0.0;
uniform float bl_y<
    string label = "Abajo izquierda Y (%)";
    string widget_type = "slider";
    float minimum = -50.0; float maximum = 150.0; float step = 0.01;
> = 100.0;

uniform float edge_soft<
    string label = "Suavizado del borde (px)";
    string widget_type = "slider";
    float minimum = 0.0; float maximum = 10.0; float step = 0.1;
> = 1.0;

float4 mainImage(VertData v_in) : TARGET
{
    float2 S = uv_size;
    // Esquinas en pixeles, en el orden del cuadrado unitario: (0,0) (1,0) (1,1) (0,1)
    float2 p0 = float2(tl_x, tl_y) * 0.01 * S;
    float2 p1 = float2(tr_x, tr_y) * 0.01 * S;
    float2 p2 = float2(br_x, br_y) * 0.01 * S;
    float2 p3 = float2(bl_x, bl_y) * 0.01 * S;

    // Homografía cuadrado → cuadrilátero: x = (a u + b v + c) / (g u + h v + 1), igual para y
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

    // Inversa por la adjunta de [[a b c] [d e f] [g h 1]]
    float2 p = v_in.uv * S;
    float qx = (e - f * h) * p.x + (c * h - b) * p.y + (b * f - c * e);
    float qy = (f * g - d) * p.x + (a - c * g) * p.y + (c * d - a * f);
    float qw = (d * h - e * g) * p.x + (b * g - a * h) * p.y + (a * e - b * d);
    if (abs(qw) < 1e-8)
        return float4(0.0, 0.0, 0.0, 0.0);
    float2 uv = float2(qx, qy) / qw;

    // Cobertura: distancia a la orilla del cuadrado unitario, convertida a pixeles de pantalla
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
