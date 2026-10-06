'use client';

import { useActionState } from 'react';
import { LoaderCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requestLink, type SignInState } from '@/app/signin/actions';

/**
 * One field and one button.
 *
 * `useActionState` rather than a fetch: the action is a server function, so
 * there is no endpoint to call and no JSON to shape, and the form submits and
 * reports without this component knowing how mail is sent. `pending` comes from
 * the same hook, which is why there is no `useState` here at all.
 */
export function SignInForm() {
  const [state, submit, pending] = useActionState<SignInState, FormData>(
    requestLink,
    {},
  );

  return (
    <form action={submit} className="space-y-4" data-testid="sign-in-form">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          // The first thing on the page, and the only thing to do on it.
          autoFocus
          required
          placeholder="you@school.edu"
          defaultValue={state.email}
          disabled={pending}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? 'email-error' : undefined}
        />
        {state.error && (
          /*
            `role="alert"` rather than a styled span: a message that appears
            after a submit is one a screen reader has no reason to revisit the
            form to find.
          */
          <p
            id="email-error"
            role="alert"
            data-testid="sign-in-error"
            className="text-sm text-destructive"
          >
            {state.error}
          </p>
        )}
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <>
            <LoaderCircleIcon className="animate-spin" />
            Sending
          </>
        ) : (
          'Email me a link'
        )}
      </Button>

      <p className="text-xs text-muted-foreground">
        No password. We email you a link that signs you in.
      </p>
    </form>
  );
}
