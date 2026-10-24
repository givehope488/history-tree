import { StoreProvider, useStore } from './store';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EventForm } from './components/EventForm';
import { TopBar } from './components/TopBar';
import { TreeDiagram } from './components/TreeDiagram';
import { Toast } from './components/ui';

function Footer() {
  const { collaborative } = useStore();
  return (
    <footer className="no-print mx-auto w-full max-w-[1600px] px-4 pb-10 pt-6 text-center text-[11px] leading-5 text-ink-400 lg:px-8">
      <p>
        教材内容取自《中国近现代史纲要》(2023年版) 第十章；中国为主干，其他国家为分支，同一时间的事件在同一水平线上。
      </p>
      <p className="mt-1">
        {collaborative
          ? '点击节点展开详情；同一链接里的所有人实时协同编辑，点顶栏「复制链接」把地址发给同学即可一起改。'
          : '点击节点展开详情；数据保存在本机浏览器 localStorage，可用顶栏「数据」导出 JSON 备份或分享。'}
      </p>
    </footer>
  );
}

function Shell() {
  const { state } = useStore();

  return (
    <div className="min-h-full">
      <TopBar />
      <main className="mx-auto w-full max-w-[1600px] px-4 pb-24 pt-5 lg:px-8">
        <TreeDiagram />
      </main>
      <Footer />

      {state.form ? <EventForm key={state.form.kind === 'edit' ? state.form.eventId : 'create'} form={state.form} variant="overlay" /> : null}

      <ConfirmDialog />
      {state.toast ? <Toast key={state.toast.id} message={state.toast.message} tone={state.toast.tone} /> : null}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
