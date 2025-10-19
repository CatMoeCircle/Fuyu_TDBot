<template>
    <div class="flex flex-col text-black"
        style="background: linear-gradient(132.5deg, rgba(255, 255, 255, 1) 0%, rgba(206, 237, 219, 1) 100%);">
        <div class="flex absolute h-60 w-full">
            <img src="https://img.js.design/assets/img/68f3403b3f22157da640de5d.png" class="h-full w-full"
                style="object-fit: cover;">
            <div class="absolute flex h-full w-full"
                style="background: linear-gradient(90deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0.09) 70%);">
            </div>
        </div>
        <div class="flex flex-col p-4" style="gap: 1rem;">
            <div class="flex flex-col p-6 mt-2 mb-5" style="gap: 3px;">
                <h1 class="text-4xl m-0 p-0">帮助</h1>
                <p class="text-sm text-neutral-400 m-0 p-0 pl-1">Fuyu_TDBot - Help</p>
            </div>
            <div v-for="plugin in data" :key="plugin.name"
                class="flex flex-col bg-white/90 bg-opacity-70 p-4 rounded-xl"
                style="border: 1px solid rgba(0, 0, 0, 0.1); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">
                <div class="flex items-center" style="gap: 0.5rem;">
                    <h2 class="text-xl font-semibold m-0 p-0" :title="plugin.name"
                        style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px;">{{
                            plugin.name }}</h2>
                    <p class="m-0 p-0 text-xs" :title="plugin.desc"
                        style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px;">{{
                            plugin.desc }}</p>
                </div>
                <div class="flex flex-wrap mt-2 " style="gap: 0.5rem;">
                    <div v-for="command in plugin.commands" :key="command.name"
                        class="flex flex-col p-1.5 bg-opacity-50 rounded-lg"
                        style="border: 1px solid rgba(0, 0, 0, 0.1);box-shadow: 0 0 6px rgba(0, 0, 0, 0.3); width: 24%; flex-grow: 0; flex-shrink: 0; box-sizing: border-box;">
                        <h3 class="text-base font-medium m-0 p-0" :title="command.name"
                            style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ command.name }}
                        </h3>
                        <p class="m-0 p-0 text-xs text-black/60" :title="command.desc"
                            style="display: -webkit-box; -webkit-box-orient: vertical; line-clamp: 2; -webkit-line-clamp: 2; overflow: hidden; text-overflow: ellipsis; white-space: normal;">
                            {{ command.desc }}
                        </p>
                    </div>
                </div>
            </div>
            <div class="flex items-center justify-end">
                <h1 class="flex flex-col m-0 p-0 text-neutral-400 text-xs">Fuyu_TDBot - v{{ version }}</h1>
            </div>
        </div>
    </div>
</template>
<script setup lang="ts">
defineProps<{
    version: string;
    data: {
        name: string;
        desc: string;
        commands: {
            name: string;
            desc: string;
        }[];
    }[]
}>()
</script>