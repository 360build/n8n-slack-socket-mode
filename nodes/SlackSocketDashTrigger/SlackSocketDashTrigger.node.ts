import {
    INodeType,
    INodeTypeDescription,
    ITriggerFunctions,
    ITriggerResponse,
    NodeConnectionType
} from 'n8n-workflow';
import { App } from '@slack/bolt';

interface SlackCredential {
    botToken: string;
    appToken: string;
    signingSecret: string;
}

export class SlackSocketDashTrigger implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Slack Dash Trigger',
        name: 'slackSocketDashTrigger',
        group: ['trigger'],
        version: 1,
        description: 'Triggers workflow when a dash bot event gets triggered',
        defaults: {
            name: 'Slack Dash Trigger',
        },
        icon: 'file:./assets/slack-dash.svg',
        inputs: [],
        outputs: [NodeConnectionType.Main],
        credentials: [
            {
                name: 'slackSocketCredentialsApi',
                required: true,
            },
        ],
        properties: [
            {
                displayName: 'Trigger Type',
                name: 'triggerType',
                type: 'options',
                options: [
                    {
                        name: 'Slash Command',
                        value: 'slashCommand',
                        description: 'Trigger when a specific Slack slash command is invoked (e.g., /mycommand)',
                    },
                    {
                        name: 'Events',
                        value: 'events',
                        description: 'Trigger on various Slack events (e.g., app_mention, message, user_change)',
                    },
                    {
                        name: 'Interactive Component (Actions)',
                        value: 'interactiveComponent',
                        description: 'Trigger on user interactions with buttons, select menus, etc. (block_actions).',
                    },
                ],
                default: 'slashCommand',
                description: 'Select whether to trigger on Slack events, slash commands, or interactive components',
            },
            {
                displayName: 'Slash Command',
                name: 'slashCommandName',
                type: 'string',
                default: '',
                placeholder: '/yourcommand',
                description: 'The full slash command to listen for (e.g., /mycommand). Leave empty to listen for any command.',
                displayOptions: {
                    show: {
                        triggerType: ['slashCommand'],
                    },
                },
            },
        ],
    };

    async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
        const credentials = await this.getCredentials<SlackCredential>('slackSocketCredentialsApi');

        const app = new App({
            token: credentials.botToken,
            signingSecret: credentials.signingSecret,
            appToken: credentials.appToken,
            socketMode: true,
        });

        const process = async (
            params: {
                ack: Function;
                command?: any;
                body?: any;
                context?: any;
                payload?: any;
            }
        ) => {
            const { ack, command, body, context, payload } = params;

            await ack(); // mandatory to avoid dispatch_failed

            this.emit([
                this.helpers.returnJsonArray({ command, body, context, payload })
            ]);
        };

        const slashCommandName = this.getNodeParameter('slashCommandName', '') as string;
        const handler = async (args: any) => {
            await process.call(this, args);
        };

        // Set up the listener(s) *before* starting the app
        if (slashCommandName) {
            app.command(slashCommandName, handler);
        } else {
            app.command(/.*/, handler);
        }

        // Start the app for the appropriate mode
        if (this.getMode() === 'trigger') {
            try {
                await app.start();
                this.logger.info('Started Slack Socket app in trigger mode');
            } catch (error) {
                this.logger.error('Error starting Slack Socket app in trigger mode:', error);
                // Important: If app fails to start, the trigger should ideally indicate a failure.
                // Depending on n8n's error handling for trigger nodes, you might throw the error.
                throw error;
            }
        }

        const manualTriggerFunction = async () => {
            // This function is for "Test Workflow" button in n8n.
            // It should also start the app to listen for events during testing.
            try {
                await app.start();
                this.logger.info('Started Slack Socket app in test mode');
            } catch (error) {
                this.logger.error('Error starting Slack Socket app in test mode:', error);
                throw error; // Propagate error for manual trigger as well
            }

            // For manual trigger, you might want a way to stop it after a certain time,
            // or rely on the user manually stopping the test.
            // Returning a promise that resolves immediately means the manual trigger finishes setup,
            // but the app continues running in the background until the test is stopped.
            return new Promise<void>((resolve) => {
                // If you want the manual trigger to wait for a specific event or timeout,
                // you would manage the resolve here. For a continuous listener, this is fine.
                resolve();
            });
        };

        const closeFunction = async () => {
            try {
                await app.stop();
                this.logger.info('Stopped Slack Socket app');
            } catch (error) {
                this.logger.error('Error stopping Slack Socket app:', error);
            }
        };

        return {
            closeFunction,
            manualTriggerFunction
        };
    }
}