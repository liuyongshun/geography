import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: () => import('@/views/layout/AppShell.vue'),
      children: [
        {
          path: '',
          redirect: { name: 'resources' },
        },
        {
          path: 'catalog',
          name: 'home',
          component: () => import('@/views/Course/CoursesHome.vue'),
        },
        {
          path: 't/:tutorialId',
          name: 'tutorial',
          component: () => import('@/views/Course/TutorialView.vue'),
        },
        {
          path: 'resources',
          name: 'resources',
          component: () => import('@/views/Resources/index.vue'),
        },
        {
          path: 'demo/:tutorialId',
          name: 'demo',
          component: () => import('@/views/DemoLab/index.vue'),
        },
        {
          path: 'lab/:tutorialId?',
          name: 'lab',
          component: () => import('@/views/GeoLab/index.vue'),
          props: true,
        },
      ],
    },
    { path: '/courses', redirect: { name: 'resources' } },
    { path: '/courses/t/:tutorialId', redirect: (to) => `/t/${to.params.tutorialId}` },
  ],
})
