import { DocsSection } from "./DocsSection";
import { Footer } from "./Footer";
import { ImmersiveStage } from "./ImmersiveStage";
import { ReplayGallery } from "./ReplayGallery";
import { ScrollSnapController } from "./ScrollSnapController";
import { TopNav } from "./TopNav";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fffdf8_0%,#f7f4ec_44%,#efe8db_100%)]">
      <ScrollSnapController />
      <TopNav />
      <ImmersiveStage />
      <ReplayGallery />
      <DocsSection />
      <Footer />
    </div>
  );
}
