<template>
    <div
        style="position: relative; display: flex; flex-direction: column; width: 400px; height: 285px; overflow: hidden; box-sizing: border-box; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);">
        <div style="position: absolute; display: flex; width: 400px; height: 135px; box-sizing: border-box;">
            <img :src="backgroundImage" alt="background" style="width: 400px; height: 135px; object-fit: cover;" />
        </div>

        <div
            style="position: absolute; display: flex; flex-direction: column; width: 400px; height: 165px; top: 128px; border-radius: 5px; box-sizing: border-box; background-image: linear-gradient(to bottom right, #ffffff 0%, #fff3ff 100%); box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);">
            <div style="display: flex; flex-direction: column; margin-left: 20px; box-sizing: border-box;">
                <h2
                    style="margin: 30px 0 0 0; padding: 0; max-width: 360px; font-size: 21px; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    {{ userFullName }}
                </h2>
                <p
                    style="margin: 0; padding: 0; max-width: 360px; font-size: 15px; color: #808080; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    @{{ userName }}
                </p>
                <p
                    style="margin: 15px 0 0 0; padding: 0; max-width: 360px; font-size: 15px; color: #808080; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ID: <span>{{ ID }}</span> - DC: <span>{{ dcId ? dcId : 'null' }}</span>
                </p>
            </div>

            <div
                style="display: flex; margin: 20px 20px 0 20px; justify-content: space-between; align-items: center; box-sizing: border-box;">
                <div style="display: flex;">
                    <p style="margin: 0; padding: 0; font-size: 7px; color: #808080;">如果DC为空请检查头像是否设置或公开显示以及设置用户名</p>
                </div>
                <div style="display: flex;">
                    <p style="margin: 0; padding: 0; font-size: 7px; color: #808080;">Fuyu-TDBot - v<span>{{ version
                            }}</span></p>
                </div>
            </div>
        </div>

        <div
            style="position: absolute; display: flex; width: 80px; height: 80px; top: 80px; left: 20px; border-radius: 50%; border: 2px solid #ffffff; box-sizing: border-box; box-shadow: 0 0 10px rgba(0, 0, 0, 0.2); overflow: hidden;">
            <img :src="avatarBase64" alt="avatar"
                style="display: flex; width: 80px; height: 80px; min-width: 80px; min-height: 80px; max-width: 80px; max-height: 80px;" />
            <div v-if="isSvgAvatar"
                style="position: absolute; left: 2px; top: 2px; width: 74px; height: 68px; display: flex; justify-content: center; align-items: center;">
                <span
                    style="display: flex; color: #ffffff; font-size: 30px; font-weight: 700; line-height: 30px; margin-left: -1px; margin-top: -1px; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3); white-space: nowrap;">
                    {{ avatarText }}
                </span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
defineProps<{
    avatarBase64: string
    isSvgAvatar: boolean
    avatarText: string
    userFullName: string
    userName: string
    ID: string | number
    dcId: string | number
    version: string
    backgroundImage: string
}>()
</script>
