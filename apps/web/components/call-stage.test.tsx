import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallStage } from './call-stage';

// jsdom cannot play media; these stand in for the partner's clip.
const play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
const pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockReturnValue();
const stopTrack = jest.fn();
const getUserMedia = jest.fn();

beforeEach(() => {
  stopTrack.mockReset();
  getUserMedia.mockReset();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
});

it('asks for the camera only when pressed, and switches it off again', async () => {
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  render(<CallStage listening={false} speaking={false} thinking={false} />);
  expect(getUserMedia).not.toHaveBeenCalled();

  await userEvent.click(screen.getByTestId('camera'));
  expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: false });
  expect(screen.getByTestId('self-view')).toBeInTheDocument();

  await userEvent.click(screen.getByTestId('camera'));
  expect(stopTrack).toHaveBeenCalled();
  expect(screen.queryByTestId('self-view')).not.toBeInTheDocument();
});

it('says what to do when the camera is refused', async () => {
  getUserMedia.mockRejectedValue(new Error('NotAllowedError'));
  render(<CallStage listening={false} speaking={false} thinking={false} />);
  await userEvent.click(screen.getByTestId('camera'));
  expect(screen.getByText(/allow it in the browser/)).toBeInTheDocument();
});

it('lights up whoever is speaking', () => {
  const { rerender } = render(<CallStage listening speaking={false} thinking={false} />);
  expect(screen.getByText('You · speaking')).toBeInTheDocument();
  rerender(<CallStage listening={false} speaking thinking={false} />);
  expect(screen.getByText('Partner · speaking')).toBeInTheDocument();
  expect(play).toHaveBeenCalled();
  rerender(<CallStage listening={false} speaking={false} thinking />);
  expect(screen.getByText('Partner · thinking')).toBeInTheDocument();
  expect(pause).toHaveBeenCalled();
});
