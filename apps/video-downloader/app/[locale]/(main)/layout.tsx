import { NavbarWithSearch } from '@/components/navbar-with-search';
import packageJson from '@/package.json';

type Props = {
  children: React.ReactNode;
};

export default function MainLayout({ children }: Props) {
  return (
    <>
      <NavbarWithSearch
        logo="/logo.png"
        version={`v${packageJson.version}`}
        searchBox
        translucent
      />
      {children}
    </>
  );
}
