-- C4: every new inbox row pings n8n workflow 10 ("Notify router"), which calls
-- /api/internal/notifications/dispatch to send push (and, when enabled, SMS/WhatsApp).
create trigger n8n_notification_created
  after insert on public.user_notifications
  for each row
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/notify-dispatch');
