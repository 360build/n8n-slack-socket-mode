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

export class SlackSocketTriggerV2Trigger implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Slack Socket Mode Trigger / V2 Trigger',
        name: 'slackSocketTriggerV2Trigger',
        group: ['trigger'],
        version: 1,
        description: 'Triggers workflow when a Slack message matches a regex pattern via Socket Mode',
        defaults: {
            name: 'Slack Socket Mode Trigger',
        },
        icon: 'file:./assets/slack-socket-mode.svg',
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

        const setupEventListeners = () => {
            const slashCommandName = this.getNodeParameter('slashCommandName', '') as string;

            const handler = async (args: any) => {
                await process.call(this, args); // ensure "this.emit" is accessible
            };

            if (slashCommandName) {
                app.command(slashCommandName, handler);
            } else {
                app.command(/.*/, handler);
            }
        };

        setupEventListeners();

        const manualTriggerFunction = async () => {
            try {
                await app.start();
                this.logger.info('Started Slack Socket app in test mode');
            } catch (error) {
                this.logger.error('Error starting Slack Socket app in test mode:', error);
            }

            return new Promise<void>((resolve) => {
                resolve();
            });
        };

        if (this.getMode() === 'trigger') {
            try {
                await app.start();
                this.logger.info('Started Slack Socket app in trigger mode');
            } catch (error) {
                this.logger.error('Error starting Slack Socket app in trigger mode:', error);
            }
        }

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
