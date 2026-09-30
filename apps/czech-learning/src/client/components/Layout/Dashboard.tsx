import React, { useState } from 'react';
import { Layout, Menu } from 'antd';
import {
  BookOutlined,
  SyncOutlined,
  BarChartOutlined,
  ReadOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import { AppHeader } from './AppHeader';
import { VocabularyPage } from '../Words/VocabularyPage';

const { Sider, Content } = Layout;

const useStyles = createStyles(({ css, token }) => ({
  rootLayout: css`
    min-height: 100vh;
  `,
  bodyLayout: css`
    min-height: calc(100vh - 64px);
  `,
  sider: css`
    border-right: 1px solid ${token.colorBorderSecondary};
  `,
  menu: css`
    height: 100%;
    border-right: 0 !important;
    padding-top: 8px;
  `,
  content: css`
    padding: 24px;
    overflow: auto;
    background: ${token.colorBgLayout};
  `,
}));

export function Dashboard() {
  const { styles } = useStyles();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    { key: '/vocabulary', icon: <BookOutlined />, label: t('nav.vocabulary') },
    { key: '/review', icon: <SyncOutlined />, label: t('nav.review'), disabled: true },
    { key: '/progress', icon: <BarChartOutlined />, label: t('nav.progress'), disabled: true },
    { key: '/grammar', icon: <ReadOutlined />, label: t('nav.grammar'), disabled: true },
    { key: '/settings', icon: <SettingOutlined />, label: t('nav.settings'), disabled: true },
  ];

  const selectedKey = '/' + (location.pathname.split('/')[1] || 'vocabulary');

  return (
    <Layout className={styles.rootLayout}>
      <AppHeader />
      <Layout className={styles.bodyLayout}>
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          theme="light"
          className={styles.sider}
          width={200}
        >
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            className={styles.menu}
          />
        </Sider>
        <Content className={styles.content}>
          <Routes>
            <Route path="/vocabulary" element={<VocabularyPage />} />
            <Route path="/" element={<Navigate to="/vocabulary" replace />} />
            <Route path="*" element={<Navigate to="/vocabulary" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
