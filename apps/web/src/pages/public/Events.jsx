import { useEffect, useState } from 'react';
import Navbar from '../../components/ui/Navbar';
import Footer from '../../components/ui/Footer';
import EventCard from '../../components/events/EventCard';
import { getAllEvents } from '../../services/events.service';

const TABS = ['All', 'Upcoming', 'Live', 'Ended'];

export default function Events() {
  const [events, setEvents] = useState([]);
  const [activeTab, setActiveTab] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const status = activeTab === 'All' ? undefined : activeTab.toLowerCase();
    setLoading(true);
    getAllEvents({ status })
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [activeTab]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6">Events</h1>

          {/* Filter tabs */}
          <div className="flex gap-1 mb-8 p-1 bg-brand-dark-card rounded-lg w-fit">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab
                    ? 'bg-brand-green text-white'
                    : 'text-brand-light-dim hover:text-white hover:bg-brand-surface'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Events grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-brand-light-muted text-lg">No events found</p>
              <p className="text-brand-light-muted text-sm mt-1">Check back later for upcoming events</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
