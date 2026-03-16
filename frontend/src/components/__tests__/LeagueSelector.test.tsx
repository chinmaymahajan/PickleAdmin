import { render, screen, fireEvent } from '@testing-library/react';
import LeagueSelector from '../LeagueSelector';
import { League, LeagueFormat } from '../../types';

describe('LeagueSelector', () => {
  const mockLeagues: League[] = [
    {
      id: '1',
      name: 'Summer League',
      format: LeagueFormat.ROUND_ROBIN,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: '2',
      name: 'Winter League',
      format: LeagueFormat.ROUND_ROBIN,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  it('should render league session cards', () => {
    const mockOnSelect = jest.fn();

    render(
      <LeagueSelector
        leagues={mockLeagues}
        selectedLeagueId={null}
        onSelect={mockOnSelect}
      />
    );

    expect(screen.getByText('Your Sessions')).toBeInTheDocument();
    expect(screen.getByText('Summer League')).toBeInTheDocument();
    expect(screen.getByText('Winter League')).toBeInTheDocument();
  });

  it('should call onSelect when Resume is clicked', () => {
    const mockOnSelect = jest.fn();

    render(
      <LeagueSelector
        leagues={mockLeagues}
        selectedLeagueId={null}
        onSelect={mockOnSelect}
      />
    );

    const resumeButtons = screen.getAllByText('Resume');
    fireEvent.click(resumeButtons[0]);

    expect(mockOnSelect).toHaveBeenCalledWith('1');
  });

  it('should highlight the selected league card as active', () => {
    const mockOnSelect = jest.fn();

    const { container } = render(
      <LeagueSelector
        leagues={mockLeagues}
        selectedLeagueId="1"
        onSelect={mockOnSelect}
      />
    );

    const activeCard = container.querySelector('.session-card.active');
    expect(activeCard).toBeInTheDocument();
    expect(activeCard).toHaveTextContent('Summer League');
  });

  it('should show welcome page when no leagues available', () => {
    const mockOnSelect = jest.fn();

    render(
      <LeagueSelector
        leagues={[]}
        selectedLeagueId={null}
        onSelect={mockOnSelect}
      />
    );

    expect(screen.getByText('Welcome to Pickle Admin')).toBeInTheDocument();
    expect(screen.getByText('Start New Session')).toBeInTheDocument();
  });
});
