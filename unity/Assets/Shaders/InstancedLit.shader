// Lit surface shader with a PER-INSTANCE colour (GPU instancing), for the gingerbread bricks.
Shader "Santa/InstancedLit"
{
    Properties { _Color ("Color", Color) = (1,1,1,1) _Glossiness ("Smoothness", Range(0,1)) = 0.2 }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows addshadow
        #pragma multi_compile_instancing
        #pragma target 3.0
        half _Glossiness;
        struct Input { float3 worldPos; };
        UNITY_INSTANCING_BUFFER_START(Props)
            UNITY_DEFINE_INSTANCED_PROP(fixed4, _Color)
        UNITY_INSTANCING_BUFFER_END(Props)
        void surf (Input IN, inout SurfaceOutputStandard o)
        {
            fixed4 c = UNITY_ACCESS_INSTANCED_PROP(Props, _Color);
            o.Albedo = c.rgb; o.Smoothness = _Glossiness; o.Alpha = 1;
        }
        ENDCG
    }
    FallBack "Diffuse"
}
