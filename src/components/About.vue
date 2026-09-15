<script setup>
import { MapPin, Mail, Linkedin } from 'lucide-vue-next';
import Icon from '../components/Icon.vue'
</script>

<template>
	<div class="page about">
		<div class="section header">
			<h1 class="header__title">Léna Pignolet</h1>
			<div class="header__location">
				<MapPin aria-hidden="true" />
				<p>Paris - Reims - Troyes</p>
			</div>
		</div>

		<div class="section intro">
			<h2 class="intro__subtitle">Hello ! 👋</h2>
			<p class="intro__text">
				<span>Développeuse front-end junior</span> avec un <span>œil créatif</span>, j'aime concevoir des interfaces qui allient <span>design</span> et <span>accessibilité</span>.
			</p>
			<p class="intro__text">
				Toujours en apprentissage, j'explore continuellement de <span>nouvelles compétences</span> et technologies pour progresser dans mon métier.
			</p>
			<p class="intro__text">
				Je prends plaisir à soigner les détails pour offrir aux utilisateurs une expérience <span>fluide</span> et <span>agréable</span>.
			</p>
		</div>

		<div class="section experiences">
			<div class="section__title-container">
				<Icon name="sparkle" class="icon" aria-hidden="true" />
				<h3 class="section__title">Expériences</h3>
				<Icon name="sparkle" class="icon" aria-hidden="true" />
			</div>

			<div class="timeline">
				<div class="timeline__item">
					<div class="timeline__marker">
						<div class="timeline__icon">
							<Icon name="sparkle"
								  class="timeline__icon-svg" />
						</div>
						<div class="timeline__line"></div>
					</div>

					<div class="timeline__content">
						<h3 class="timeline__title">Développeuse Frontend</h3>
						<p class="timeline__date">2025 - présent</p>
						<p class="timeline__place">Agence Dn'D, Paris - Alternance</p>
						<p class="timeline__description">
							Développement et intégration d’interfaces web pour des
							projets e-commerce, principalement sous Magento 2, au sein
							d’une agence digitale.
						</p>
					</div>
				</div>

				<div class="timeline__item">
					<div class="timeline__marker">
						<div class="timeline__icon">
							<Icon name="sparkle"
								  class="timeline__icon-svg" />
						</div>
						<div class="timeline__line"></div>
					</div>

					<div class="timeline__content">
						<h3 class="timeline__title">Chargé de Relation Client</h3>
						<p class="timeline__date">2022 - 2024</p>
						<p class="timeline__place">BPCE Financement, Reims - Intérim</p>
						<p class="timeline__description">
							Gestion de dossiers de recouvrement amiable et négociation de solutions adaptées.
						</p>
					</div>
				</div>
			</div>
		</div>

		<div class="section education">
			<div class="section__title-container">
				<Icon name="sparkle" class="icon" aria-hidden="true" />
				<h3 class="section__title">Parcours scolaire</h3>
				<Icon name="sparkle" class="icon" aria-hidden="true" />
			</div>
			
			<div class="timeline">
				<div class="timeline__item">
					<div class="timeline__marker">
						<div class="timeline__icon dot"></div>
						<div class="timeline__line"></div>
					</div>

					<div class="timeline__content">
						<h3 class="timeline__title">BUT Métiers du Multimédia et de l'Internet</h3>
						<p class="timeline__date">2023 - 2026</p>
						<p class="timeline__place">IUT de Troyes, Troyes</p>
						<p class="timeline__description">Parcours développement web et dispositifs interactifs</p>
					</div>
				</div>

				<div class="timeline__item">
					<div class="timeline__marker">
						<div class="timeline__icon dot"></div>
						<div class="timeline__line"></div>
					</div>

					<div class="timeline__content">
						<h3 class="timeline__title">BTS Analyse Biologie Médicale</h3>
						<p class="timeline__date">2022 - 2023</p>
						<p class="timeline__place">Lycée Hugues Libergier, Reims</p>
						<p class="timeline__description">Réorientation après la 1ère année</p>
					</div>
				</div>

				<div class="timeline__item">
					<div class="timeline__marker">
						<div class="timeline__icon dot"></div>
						<div class="timeline__line"></div>
					</div>

					<div class="timeline__content">
						<h3 class="timeline__title">
							Baccalauréat Général Spécialité SVT et Physique-Chimie
						</h3>
						<p class="timeline__date">2019 - 2022</p>
						<p class="timeline__place">Lycée Georges Clémenceau, Reims</p>
						<p class="timeline__description">Mention bien</p>
					</div>
				</div>
			</div>
		</div>

		<div class="section contact">
			<div class="section__title-container">
				<Icon name="sparkle" class="icon" aria-hidden="true" />
				<h3 class="section__title">Contact</h3>
				<Icon name="sparkle" class="icon" aria-hidden="true" />
			</div>

			<p class="contact__subtitle">Vous souhaitez me contacter ?</p>

			<div class="contact__cta-wrapper">
				<a href="mailto:lena.pignolet.pro@example.com"
				   class="contact__cta contact__cta--primary">
					<Mail aria-hidden="true" />
					<span>Envoyer un mail</span>
				</a>

				<a href="https://linkedin.com/in/lenapignolet"
				   target="_blank"
				   class="contact__cta contact__cta--secondary">
					<Linkedin aria-hidden="true" />
					<span>Voir mon profil</span>
				</a>
			</div>
		</div>
	</div>
</template>
