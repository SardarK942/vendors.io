import Link from 'next/link';
import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import {
  Camera,
  Video,
  Palette,
  Scissors,
  Music,
  ImageIcon,
  UtensilsCrossed,
  Building,
  Flower,
  Mail,
} from 'lucide-react';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  photography: <Camera className="h-8 w-8" />,
  videography: <Video className="h-8 w-8" />,
  mehndi: <Palette className="h-8 w-8" />,
  hair_makeup: <Scissors className="h-8 w-8" />,
  dj: <Music className="h-8 w-8" />,
  photobooth: <ImageIcon className="h-8 w-8" />,
  catering: <UtensilsCrossed className="h-8 w-8" />,
  venue: <Building className="h-8 w-8" />,
  decor: <Flower className="h-8 w-8" />,
  invitations: <Mail className="h-8 w-8" />,
};

export function CategoryGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
      {VENDOR_CATEGORIES.map((cat) => (
        <Link
          key={cat}
          href={`/vendors?category=${cat}`}
          className="flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors hover:border-primary hover:bg-primary/5"
        >
          <div className="text-primary/80">{CATEGORY_ICONS[cat]}</div>
          <span className="text-sm font-medium">{VENDOR_CATEGORY_LABELS[cat]}</span>
        </Link>
      ))}
    </div>
  );
}
