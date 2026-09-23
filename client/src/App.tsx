import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { StudentShell } from '@/components/layout/StudentShell';
import { TeacherShell } from '@/components/layout/TeacherShell';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { HallOfFamePage } from '@/pages/student/HallOfFamePage';
import { HomePage } from '@/pages/student/HomePage';
import { MyPage } from '@/pages/student/MyPage';
import { WritePage } from '@/pages/student/WritePage';
import { DashboardPage } from '@/pages/teacher/DashboardPage';

/**
 * 라우트 골격. 로그인 가드·역할 분기는 S1(1-1, 1-2)에서 붙인다.
 *  "/"         학생 셸 (모바일 하단 탭)
 *  "/teacher"  교사 셸 (PC 좌측 메뉴)
 */
const router = createBrowserRouter([
  {
    path: '/',
    element: <StudentShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'write', element: <WritePage /> },
      {
        path: 'debate',
        element: <PlaceholderPage title="토론방" sprint="2차 개발" description="곧 열려요." />,
      },
      { path: 'hall-of-fame', element: <HallOfFamePage /> },
      { path: 'me', element: <MyPage /> },
      { path: 'login', element: <PlaceholderPage title="로그인" sprint="S1 1-1" /> },
    ],
  },
  {
    path: '/teacher',
    element: <TeacherShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      {
        path: 'pending',
        element: <PlaceholderPage title="승인 대기함" sprint="S2 2-7 · S4 4-7" />,
      },
      { path: 'students', element: <PlaceholderPage title="학생 관리" sprint="S1 1-4 · 1-5" /> },
      { path: 'comments', element: <PlaceholderPage title="댓글 모아보기" sprint="S3 3-5" /> },
      { path: 'reports', element: <PlaceholderPage title="신고함" sprint="S3 3-2" /> },
      { path: 'stats', element: <PlaceholderPage title="통계" sprint="S5 5-5" /> },
      {
        path: 'admin/school',
        element: <PlaceholderPage title="학교 설정" sprint="S1 1-3 · 1-4" />,
      },
      {
        path: 'admin/point-rules',
        element: <PlaceholderPage title="포인트 규칙" sprint="S4 4-4" />,
      },
      { path: 'admin/settlements', element: <PlaceholderPage title="월간 결산" sprint="S5 5-3" /> },
      { path: 'admin/content', element: <PlaceholderPage title="공지·문구" sprint="S5 5-6" /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
