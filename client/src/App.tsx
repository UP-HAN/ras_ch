import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { StudentShell } from '@/components/layout/StudentShell';
import { TeacherShell } from '@/components/layout/TeacherShell';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { LoginPage } from '@/pages/LoginPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { HallOfFamePage } from '@/pages/student/HallOfFamePage';
import { HomePage } from '@/pages/student/HomePage';
import { MyPage } from '@/pages/student/MyPage';
import { PostDetailPage } from '@/pages/student/PostDetailPage';
import { PostListPage } from '@/pages/student/PostListPage';
import { ReportFormPage } from '@/pages/student/ReportFormPage';
import { WritePage } from '@/pages/student/WritePage';
import { SchoolSettingsPage } from '@/pages/teacher/admin/SchoolSettingsPage';
import { StudentImportPage } from '@/pages/teacher/admin/StudentImportPage';
import { ClassPostsPage } from '@/pages/teacher/ClassPostsPage';
import { DashboardPage } from '@/pages/teacher/DashboardPage';
import { PendingPage } from '@/pages/teacher/PendingPage';
import { StudentsPage } from '@/pages/teacher/StudentsPage';

/**
 * 라우트. 로그인·역할 가드는 RequireAuth(클라이언트 편의), 실제 권한은 서버(AUTH-07).
 *  "/login", "/change-password"  셸 없음
 *  "/"         학생 셸 (모바일 하단 탭)
 *  "/teacher"  교사 셸 (PC 좌측 메뉴)
 */
const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/change-password', element: <ChangePasswordPage /> },
  {
    path: '/',
    element: (
      <RequireAuth area="student">
        <StudentShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'write', element: <WritePage /> },
      { path: 'write/report', element: <ReportFormPage /> },
      { path: 'posts', element: <PostListPage /> },
      { path: 'posts/:id', element: <PostDetailPage /> },
      { path: 'posts/:id/edit', element: <ReportFormPage /> },
      {
        path: 'debate',
        element: <PlaceholderPage title="토론방" sprint="2차 개발" description="곧 열려요." />,
      },
      { path: 'hall-of-fame', element: <HallOfFamePage /> },
      { path: 'me', element: <MyPage /> },
    ],
  },
  {
    path: '/teacher',
    element: (
      <RequireAuth area="teacher">
        <TeacherShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'pending', element: <PendingPage /> },
      { path: 'posts', element: <ClassPostsPage /> },
      { path: 'students', element: <StudentsPage /> },
      { path: 'comments', element: <PlaceholderPage title="댓글 모아보기" sprint="S3 3-5" /> },
      { path: 'reports', element: <PlaceholderPage title="신고함" sprint="S3 3-2" /> },
      { path: 'stats', element: <PlaceholderPage title="통계" sprint="S5 5-5" /> },
      { path: 'admin/school', element: <SchoolSettingsPage /> },
      { path: 'admin/students-import', element: <StudentImportPage /> },
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
