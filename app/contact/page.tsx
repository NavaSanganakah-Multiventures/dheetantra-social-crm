import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, Phone, MapPin } from 'lucide-react';

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans selection:bg-indigo-500/30 py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-12 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-900 dark:text-white mb-6 font-display">Get in Touch</h1>
            <p className="text-lg text-zinc-600 dark:text-zinc-400">
              Have questions about DheeTantra? Our team is here to help you build better customer relationships.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div>
                <h3 className="text-xl font-bold mb-6 font-display">Contact Information</h3>
                <div className="space-y-6">
                  <div className="flex items-start gap-4 text-zinc-600 dark:text-zinc-300">
                    <Mail className="w-6 h-6 text-indigo-600 mt-1" />
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-white">Email</p>
                      <p>support@dheetantra.com</p>
                      <p>sales@dheetantra.com</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 text-zinc-600 dark:text-zinc-300">
                    <Phone className="w-6 h-6 text-indigo-600 mt-1" />
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-white">Phone</p>
                      <p>+1 (555) 123-4567</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 text-zinc-600 dark:text-zinc-300">
                    <MapPin className="w-6 h-6 text-indigo-600 mt-1" />
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-white">Office</p>
                      <p>123 Innovation Drive<br/>Tech City, TC 94043</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-lg">
              <form className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">Name</label>
                  <input type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="John Doe" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">Email</label>
                  <input type="email" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="john@company.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">Message</label>
                  <textarea rows={4} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none" placeholder="How can we help?"></textarea>
                </div>
                <button type="button" className="w-full bg-indigo-600 text-white font-medium rounded-xl px-4 py-3 hover:bg-indigo-700 transition-colors">
                  Send Message
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
