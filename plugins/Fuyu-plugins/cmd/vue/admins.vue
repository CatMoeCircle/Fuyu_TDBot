<template>
    <div class="flex flex-col px-10 py-5"
        style="background: linear-gradient(132.5deg, rgba(255, 255, 255, 1) 0%, rgba(206, 237, 219, 1) 100%)">
        <h1 class="text-3xl font-bold p-0 mb-5">Admin List</h1>
        <div class="flex w-full" style="gap: 5px;">
            <div v-for="admin in admins" class="flex flex-col w-1/2 bg-white/70 rounded-xl p-2"
                style="border: 1px solid rgba(0, 0, 0, 0.1);">
                <div class="flex flex-row  items-center">
                    <div class="flex w-25 h-25 shrink-0">
                        <img :src="admin.photo ? admin.photo : 'https://img.js.design/assets/img/6901ff9acbf9ed22716834b3.png'"
                            alt="img" class="flex rounded-full w-full h-full"
                            style="border: 5px solid rgba( 255, 255, 255, 1);">
                    </div>
                    <div class="flex flex-col px-5">
                        <p class="text-2xl font-semibold m-0 p-0 whitespace-nowrap truncate">{{ admin.name }}</p>
                        <p class="text-lg text-gray-600 m-0 p-0 whitespace-nowrap truncate">@{{ admin.username }}</p>
                        <p class="text-lg text-gray-600 m-0 p-0">ID:{{ admin.id }}</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
defineProps<{
    admins: {
        id: number;
        name: string;
        username: string;
        photo: string | null;
    }[]
}>()
</script>