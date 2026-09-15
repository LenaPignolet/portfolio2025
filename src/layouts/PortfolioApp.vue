<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import About from '../components/About.vue';
import Skills from '../components/Skills.vue';
import Projects from '../components/Projects.vue';
import ProjectDetail from '../components/ProjectDetail.vue';
import { clearProjectsCache, preloadProjects } from '../utils/notion.js';
import { House, User, UserCog, Folder, FileText, Github, Gitlab, Linkedin } from 'lucide-vue-next';

const page = ref('about');
const selectedProjectId = ref(null);

const goHome = () => {
    window.location.href = '/';
};

const updateBodyBackground = (currentPage) => {
    if (currentPage === 'home') {
        document.body.classList.remove('app-background')
    } else {
        document.body.classList.add('app-background')
    }
}

const goToProject = (projectId) => {
    selectedProjectId.value = projectId;
    page.value = 'project-detail';
};

const backToProjects = () => {
    selectedProjectId.value = null;
    page.value = 'projects';
};

const isPopupOpen = ref(false);
const togglePopup = () => { isPopupOpen.value = !isPopupOpen.value; };
const closePopup = () => { isPopupOpen.value = false; };

watch(page, async (newPage) => {
    await nextTick();
    try {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch (e) {
        window.scrollTo(0, 0);
    }
    const main = document.querySelector('.app__content');
    if (main && 'scrollTop' in main) main.scrollTop = 0;
    updateBodyBackground(newPage);

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
        event: 'page_view',
        page_path: '/' + newPage,
        page_title: newPage
    });
})

onMounted(async () => {
    await preloadProjects();
    updateBodyBackground(page.value);
    document.addEventListener('click', closePopup);
    window.addEventListener('scroll', closePopup, true);
    clearProjectsCache();
});

onUnmounted(() => {
    document.removeEventListener('click', closePopup);
    window.removeEventListener('scroll', closePopup, true);
});

</script>

<template>
    <div class="app">
        <aside class="app__sidebar">
            <nav class="sidebar"
                 aria-label="Navigation principale">
                <button class="sidebar__item sidebar__item--home"
                        :class="{ 'sidebar__item--active': page === 'home' }"
                        :aria-current="page === 'home' ? 'page' : undefined"
                        @click="goHome">
                    <span class="sr-only">Accueil</span>
                    <House class="sidebar__icon"
                            aria-hidden="true" />
                </button>

                <div class="sidebar__wrapper">
                    <button class="sidebar__item"
                            :class="{ 'sidebar__item--active': page === 'about' }"
                            :aria-current="page === 'about' ? 'page' : undefined"
                            @click="page = 'about'">
                        <span class="sr-only">À propos</span>
                        <User class="sidebar__icon"
                              aria-hidden="true" />
                    </button>

                    <button class="sidebar__item"
                            :class="{ 'sidebar__item--active': page === 'skills' }"
                            :aria-current="page === 'skills' ? 'page' : undefined"
                            @click="page = 'skills'">
                        <span class="sr-only">Compétences</span>
                        <UserCog class="sidebar__icon"
                                 aria-hidden="true" />
                    </button>

                    <button class="sidebar__item"
                            :class="{ 'sidebar__item--active': page === 'projects' || page === 'project-detail' }"
                            :aria-current="page === 'projects' || page === 'project-detail' ? 'page' : undefined"
                            @click="backToProjects">
                        <span class="sr-only">Projets</span>
                        <Folder class="sidebar__icon"
                                aria-hidden="true" />
                    </button>
                </div>

                <div class="sidebar__profile--wrapper"
                    @click.stop="togglePopup">
                    <p class="sidebar__name">Léna PIGNOLET</p>
                    <img src="/images/profile-picture.webp"
                        class="sidebar__profile"
                        alt="Photo de profil de Léna Pignolet" />

                    <div class="sidebar__popup"
                        :class="{ 'sidebar__popup--visible': isPopupOpen }"
                        @click.stop>
                        <a href="/documents/cv_Lena_Pignolet.pdf" class="sidebar__popup-link"
                        target="_blank" rel="noopener">
                            <FileText aria-hidden="true" />
                            <span>Mon CV</span>
                        </a>
                        <a href="https://www.linkedin.com/in/LenaPignolet" class="sidebar__popup-link"
                        aria-label="Profil LinkedIn" target="_blank" rel="noopener">
                            <Linkedin aria-hidden="true" />
                            <span>LinkedIn</span>
                        </a>
                        <a href="https://github.com/LenaPignolet" class="sidebar__popup-link"
                        aria-label="Profil GitHub" target="_blank" rel="noopener">
                            <Github aria-hidden="true" />
                            <span>GitHub</span>
                        </a>
                        <a href="https://gitlab.com/DnD-Nyx" class="sidebar__popup-link"
                        aria-label="Profil GitLab" target="_blank" rel="noopener">
                            <Gitlab aria-hidden="true" />
                            <span>GitLab</span>
                        </a>
                    </div>
                </div>
            </nav>
        </aside>

        <main class="app__content">
            <About v-if="page === 'about'" />
            <Skills v-if="page === 'skills'" />
            <Projects v-if="page === 'projects'"
                      @select-project="goToProject" />
            <ProjectDetail v-if="page === 'project-detail'"
                           :project-id="selectedProjectId"
                           @back="backToProjects" />
        </main>
    </div>
</template>
