import { DocsSection } from "./DocsSection";
import { HeroSection } from "./HeroSection";
import { PlaygroundSection } from "./PlaygroundSection";
import { ReplayGallery } from "./ReplayGallery";
import { TopNav } from "./TopNav";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fffdf8_0%,#f7f4ec_44%,#efe8db_100%)]">
      <TopNav />
      <HeroSection />
      <PlaygroundSection />
      <ReplayGallery />
      <DocsSection />
    </div>
  );
}
