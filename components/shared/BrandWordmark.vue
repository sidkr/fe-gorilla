<script setup>
import { computed } from "vue";
// Fe-Mail Gorilla logotype — the "Industrial Wordmark": an "Fe" element badge
// reading as the "Fe-" of the name, a heavy geometric "Mail Gorilla", and an
// industrial baseline rule with a coral notch. viewBox is cropped tight to the
// content so it sizes predictably by height beside the mark.
const props = defineProps({
  height: { type: [Number, String], default: 34 },
});
const width = computed(() => Math.round((Number(props.height) * 300) / 54));
</script>

<template>
  <svg :width="width" :height="height" viewBox="0 16 300 54"
       xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fe-Mail Gorilla">
    <title>Fe-Mail Gorilla</title>

    <!-- "Fe" element badge -->
    <rect x="8" y="20" width="44" height="44" rx="6" fill="#FF4E4E"/>
    <text x="30" y="53" font-family="Manrope, Inter, system-ui, sans-serif"
          font-weight="800" font-size="30" letter-spacing="-1.5"
          text-anchor="middle" fill="#FFFFFF">Fe</text>
    <text x="13" y="33" font-family="Manrope, Inter, system-ui, sans-serif"
          font-weight="800" font-size="9" fill="#FFE8E8">26</text>

    <!-- Wordmark -->
    <text x="62" y="53" font-family="Manrope, Inter, system-ui, sans-serif"
          font-weight="800" font-size="30" letter-spacing="-1.6"
          fill="#18181B">Mail<tspan fill="#56565E"> Gorilla</tspan></text>

    <!-- Industrial baseline rule + coral notch -->
    <rect x="62" y="62" width="230" height="3" rx="1.5" fill="#18181B"/>
    <rect x="62" y="62" width="34" height="3" rx="1.5" fill="#FF4E4E"/>
  </svg>
</template>

<style scoped>
svg { display: block; }
</style>
