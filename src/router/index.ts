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
          name: 'home',
          component: () => import('@/views/Course/CoursesHome.vue'),
        },
        {
          path: 't/:tutorialId',
          name: 'tutorial',
          component: () => import('@/views/Course/TutorialView.vue'),
        },
      ],
    },
    { path: '/courses', redirect: '/' },
    { path: '/courses/t/:tutorialId', redirect: (to) => `/t/${to.params.tutorialId}` },
    {
      path: '/lab/:tutorialId?',
      name: 'lab',
      component: () => import('@/views/GeoLab/index.vue'),
      props: true,
    },
    {
      path: '/demo/:tutorialId',
      name: 'demo',
      component: () => import('@/views/DemoLab/index.vue'),
    },
  ],
})
