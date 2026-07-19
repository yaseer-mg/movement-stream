import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/ui/Navbar';
import Footer from '../../components/ui/Footer';
import LiveBanner from '../../components/ui/LiveBanner';
import EventCard from '../../components/events/EventCard';
import { getAllEvents } from '../../services/events.service';

export default function Home() {
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => {
    getAllEvents({ featured: true, status: 'upcoming' })
      .then(setEvents)
      .catch(() => {})
      .finally(() => setEventsLoading(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 pt-16">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-green-dark/30 to-brand-dark" />
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight">
              Movement Stream
            </h1>
            <p className="mt-4 text-lg sm:text-xl text-brand-light-dim max-w-2xl mx-auto leading-relaxed">
              Spreading peace, unity, and knowledge through live broadcast across Nigeria and the world.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/watch"
                className="px-8 py-3 rounded-md bg-brand-green text-white text-base font-semibold hover:bg-brand-green-light transition-colors"
              >
                Watch Live
              </Link>
              <Link
                to="/events"
                className="px-8 py-3 rounded-md border border-brand-light-dim text-brand-light text-base font-medium hover:bg-brand-surface transition-colors"
              >
                View Events
              </Link>
            </div>
          </div>
        </section>

        {/* Live Banner & Featured Events */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 mb-8">
          <LiveBanner />
        </section>

        {/* Featured Events */}
        {!eventsLoading && events.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-white">Upcoming Events</h2>
              <Link to="/events" className="text-brand-green-400 text-sm font-medium hover:text-brand-green-300 transition-colors">
                View all &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.slice(0, 3).map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </section>
        )}

        {/* About Section */}
        <section className="border-t border-brand-dark-border py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6">About Us</h2>
            <div className="space-y-4 text-brand-light-dim text-base sm:text-lg leading-relaxed">
              <p>
                Our movement is dedicated to promoting peace, unity, and understanding among all people in Nigeria and abroad.
                With millions of members across the nation, we work tirelessly to spread a message of hope and harmony.
              </p>
              <p>
                Through Movement Stream, we bring our conferences, seminars, and events directly to you — wherever you are in the world.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
