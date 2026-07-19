import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-brand-dark-border py-12 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-brand-green flex items-center justify-center">
                <span className="text-white text-xxs font-bold">MS</span>
              </div>
              <span className="text-white font-bold">Movement Stream</span>
            </div>
            <p className="text-brand-light-muted text-sm leading-relaxed">
              Spreading peace, unity, and knowledge through live broadcast.
            </p>
          </div>

          <div>
            <h3 className="text-white text-sm font-semibold mb-3">Quick Links</h3>
            <div className="flex flex-col gap-2">
              <FooterLink to="/">Home</FooterLink>
              <FooterLink to="/watch">Watch Live</FooterLink>
              <FooterLink to="/events">Events</FooterLink>
              <FooterLink to="/recordings">Recordings</FooterLink>
            </div>
          </div>

          <div>
            <h3 className="text-white text-sm font-semibold mb-3">Contact</h3>
            <p className="text-brand-light-muted text-sm leading-relaxed">
              For inquiries, reach out to your local Movement representative.
            </p>
          </div>
        </div>

        <div className="border-t border-brand-dark-border mt-8 pt-6 text-center">
          <p className="text-brand-light-muted text-xs">
            &copy; {new Date().getFullYear()} Movement Stream. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ to, children }) {
  return (
    <Link to={to} className="text-brand-light-muted text-sm hover:text-brand-light transition-colors">
      {children}
    </Link>
  );
}
