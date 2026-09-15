<script setup>
    import { ref, computed, onMounted } from 'vue';
    import { clearProjectsCache, getProjects } from '../utils/notion.js';
    import { logger } from '../utils/logger.js';
    import Icon from '../components/Icon.vue';

    const emit = defineEmits(['select-project']);

    const projects = ref([]);
    const loading = ref(true);
    const error = ref(null);
    const selectedFilter = ref('all');

    const uniqueFilters = computed(() => {
        const filters = new Set();
        projects.value.forEach((project) => {
            project.filters?.forEach((filter) => filters.add(filter));
        });
        return Array.from(filters).sort();
    });

    const filteredProjects = computed(() => {
        if (selectedFilter.value === 'all') {
            return projects.value;
        }
        return projects.value.filter((project) => project.filters?.includes(selectedFilter.value));
    });

    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
        });
    }

    function selectProject(event, projectId) {
        event.preventDefault();
        logger.debug('Projects.vue', 'Sélection du projet', projectId);
        emit('select-project', projectId);
    }

    onMounted(async () => {
        try {
            logger.loading('Projects.vue', 'Chargement des projets...');
            projects.value = await getProjects();
            
            logger.success('Projects.vue', 'Projets reçus', {
                'Total': projects.value.length,
                'Avec images': projects.value.filter(p => p.images?.length > 0).length,
                'Sans images': projects.value.filter(p => !p.images?.length).length,
                'Résumé': projects.value.map(p => ({
                    id: p.id,
                    title: p.title,
                    images: p.images?.length ?? 0,
                }))
            });
            
            if (projects.value.length === 0) {
                logger.warning('Projects.vue', 'Aucun projet trouvé');
                error.value = 'Aucun projet trouvé.';
            }
            
        } catch (err) {
            logger.error('Projects.vue', 'Erreur de chargement', err.message);
            error.value = err.message;
        } finally {
            loading.value = false;
        }
    });
</script>

<template>
    <div class="page projects">
        <div class="section header">
            <div class="header__title--wrapper">
                <Icon name="sparkle" class="icon" aria-hidden="true" />
                <h1 class="header__title">Projets</h1>
                <Icon name="sparkle" class="icon" aria-hidden="true" />
            </div>
            <p class="header__subtitle">Découvrez mes réalisations</p>
        </div>

        <div class="section filters">
            <div class="section__title-container">
				<Icon name="sparkle" class="icon" aria-hidden="true" />
				<h3 class="section__title">Catégories</h3>
				<Icon name="sparkle" class="icon" aria-hidden="true" />
			</div>
            <div class="filters__list">
                <button
                    class="filter-btn"
                    :class="{ 'filter-btn--active': selectedFilter === 'all' }"
                    @click="selectedFilter = 'all'"
                >
                    Tout
                </button>
                <button
                    v-for="filter in uniqueFilters"
                    :key="filter"
                    class="filter-btn"
                    :class="{ 'filter-btn--active': selectedFilter === filter }"
                    @click="selectedFilter = filter"
                >
                    {{ filter }}
                </button>
            </div>
        </div>

        <div v-if="loading" class="section loading">
            <p>Chargement des projets...</p>
        </div>

        <div v-else-if="error" class="section error">
            <p>{{ error }}</p>
        </div>

        <div v-else-if="filteredProjects.length === 0" class="section empty">
            <p>Aucun projet trouvé.</p>
        </div>

        <div v-else class="projects-container">
            <div class="projects-grid">
                <article v-for="project in filteredProjects" :key="project.id" class="project-card"
                     @click="selectProject($event, project.id)">
                    <div v-if="project.images?.length" class="project-card__image-wrapper">
                        <img
                            v-if="project.images?.length"
                            :src="project.images[0]"
                            :alt="project.title"
                            class="project-card__image"
                            @error="(e) => {
                                logger.warning('Projects.vue', 'Erreur chargement image', project.images[0]);
                                e.target.src = '/fallback-image.webp';
                            }"
                            @load="() => logger.debug('Projects.vue', 'Image chargée', project.images[0])"
                        />
                    </div>

                    <div class="project-card__content">
                        <a 
                            href="#" 
                            class="project-card__cta" 
                            @click="selectProject($event, project.id)"
                            :aria-label="`Voir les détails du projet ${project.title}`"
                        >
                            <Icon name="arrow-top-right" class="icon" aria-hidden="true" />
                        </a>

                        <div class="project-card__skills" v-if="project.skills?.length">
                            <span v-for="skill in project.skills" :key="skill" class="skill-tag">
                                {{ skill }}
                            </span>
                        </div>

                        <h2 class="project-card__title">{{ project.title }}</h2>

                        <p v-if="project.date" class="project-card__date">{{ formatDate(project.date) }}</p>

                        <div v-if="project.filters?.length > 1" class="project-card__filters">
                            <span v-for="filter in project.filters.slice(1)" :key="filter" class="filter">
                                {{ filter }}
                            </span>
                        </div>
                    </div>
                </article>
            </div>
        </div>
    </div>
</template>
