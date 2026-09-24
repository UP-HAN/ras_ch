import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { StudentShell } from '@/components/layout/StudentShell';
import { TeacherShell } from '@/components/layout/TeacherShell';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { LoginPage } from '@/pages/LoginPage';
import { ContentPage } from '@/pages/teacher/admin/ContentPage';
import { SettlementPage } from '@/pages/teacher/admin/SettlementPage';
import { StatsPage } from '@/pages/teacher/StatsPage';
import { HallOfFamePage } from '@/pages/student/HallOfFamePage';
import { HomePage } from '@/pages/student/HomePage';
import { MyPage } from '@/pages/student/MyPage';
import { MyPointsPage } from '@/pages/student/MyPointsPage';
import { DebatePage } from '@/pages/student/DebatePage';
import { DebateTopicPage } from '@/pages/student/DebateTopicPage';
import { NewsPage } from '@/pages/teacher/NewsPage';
import { ReviewPostPage } from '@/pages/student/ReviewPostPage';
import { ReviewQueuePage } from '@/pages/student/ReviewQueuePage';
import { PostDetailPage } from '@/pages/student/PostDetailPage';
import { PostListPage } from '@/pages/student/PostListPage';
import { ArticleFormPage } from '@/pages/student/ArticleFormPage';
import { ReportFormPage } from '@/pages/student/ReportFormPage';
import { WritePage } from '@/pages/student/WritePage';
import { CouncilFormPage } from '@/pages/student/CouncilFormPage';
import { CouncilListPage } from '@/pages/student/CouncilListPage';
import { CouncilPostPage } from '@/pages/student/CouncilPostPage';
import { CouncilPage } from '@/pages/teacher/CouncilPage';
import { SchoolSettingsPage } from '@/pages/teacher/admin/SchoolSettingsPage';
import { StudentImportPage } from '@/pages/teacher/admin/StudentImportPage';
import { BannedWordsPage } from '@/pages/teacher/admin/BannedWordsPage';
import { ApprovalSettingsPage } from '@/pages/teacher/admin/ApprovalSettingsPage';
import { PointRulesPage } from '@/pages/teacher/admin/PointRulesPage';
import { ClassPostsPage } from '@/pages/teacher/ClassPostsPage';
import { CommentsPage } from '@/pages/teacher/CommentsPage';
import { DashboardPage } from '@/pages/teacher/DashboardPage';
import { PendingPage } from '@/pages/teacher/PendingPage';
import { ReportsPage } from '@/pages/teacher/ReportsPage';
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
      { path: 'write/article', element: <ArticleFormPage /> },
      { path: 'write/council', element: <CouncilFormPage /> },
      { path: 'council', element: <CouncilListPage /> },
      { path: 'council/:id', element: <CouncilPostPage /> },
      { path: 'council/:id/edit', element: <CouncilFormPage /> },
      { path: 'posts', element: <PostListPage /> },
      { path: 'posts/:id', element: <PostDetailPage /> },
      { path: 'posts/:id/edit', element: <ReportFormPage /> },
      { path: 'posts/:id/edit-article', element: <ArticleFormPage /> },
      { path: 'debate', element: <DebatePage /> },
      { path: 'debate/:id', element: <DebateTopicPage /> },
      { path: 'hall-of-fame', element: <HallOfFamePage /> },
      { path: 'me', element: <MyPage /> },
      { path: 'me/points', element: <MyPointsPage /> },
      { path: 'review', element: <ReviewQueuePage /> },
      { path: 'review/:id', element: <ReviewPostPage /> },
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
      { path: 'comments', element: <CommentsPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'stats', element: <StatsPage /> },
      { path: 'hall-of-fame', element: <HallOfFamePage /> },
      { path: 'news', element: <NewsPage /> },
      { path: 'council', element: <CouncilPage /> },
      { path: 'admin/school', element: <SchoolSettingsPage /> },
      { path: 'admin/students-import', element: <StudentImportPage /> },
      { path: 'admin/banned-words', element: <BannedWordsPage /> },
      { path: 'admin/point-rules', element: <PointRulesPage /> },
      { path: 'admin/approval', element: <ApprovalSettingsPage /> },
      { path: 'admin/settlements', element: <SettlementPage /> },
      { path: 'admin/content', element: <ContentPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
