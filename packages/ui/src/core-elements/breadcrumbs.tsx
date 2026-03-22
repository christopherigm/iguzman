import Link from 'next/link';
import { Typography } from '@repo/ui/core-elements/typography';
import './breadcrumbs.css';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="breadcrumb" className="breadcrumbs">
      <ol className="breadcrumbs__list">
        {items.map((item, index) => (
          <li key={index} className="breadcrumbs__item">
            {index > 0 && (
              /* Decorative separator — aria-hidden, not content text */
              <span className="breadcrumbs__separator" aria-hidden="true">
                ›
              </span>
            )}
            {item.href ? (
              <Link href={item.href} prefetch className="breadcrumbs__link">
                {item.label}
              </Link>
            ) : (
              <Typography as="span" variant="none" className="breadcrumbs__current" aria-current="page">
                {item.label}
              </Typography>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
